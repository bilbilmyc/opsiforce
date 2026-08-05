---
name: incoming-email
description: Give the app an email address it can RECEIVE mail at — inbound email with attachments. Use when the user wants to email data into their app, or asks "what's my app's email address?" / wants that address rotated. This is INBOUND only — sending email is not supported (see the send-email skill).
---

# Incoming Email

Every ProjectEnvironment can have its own random receiving address (e.g. `k3p9x2mq7fd41abv@mail.example.com`). Mail sent to it is received by the platform, stored durably in the environment's `external-services.db` — **including attachments** — and, if the app declares the capability, the platform rings a "doorbell" endpoint on the app so it can react immediately.

Storage does not depend on the app: mail lands in SQLite even while the pod is stopped, the handler is unimplemented, or the app is broken. Nothing is lost; the app catches up by reading rows it has not processed.

**Inbound only.** The platform cannot *send* email — see the `send-email` skill for the outbound story and its in-app alternatives.

## The address — always fetch it, never hard-code it

Each environment has a **different** address (Development and each published environment are separate), and the address can be rotated at any time. A hard-coded address is wrong the moment the app is published.

```bash
curl -s "$SERVICE_GATEWAY_URL/external-services/incoming-email/address" \
  -H "Authorization: Bearer $SERVICE_GATEWAY_API_KEY"
# {"address":"k3p9x2mq7fd41abv@mail.example.com"}
```

The address is created on the first call and the same one is returned forever after — calling it repeatedly is safe. The key is environment-scoped, so this always returns *this* environment's address.

- **Tell the user the address in chat** so they can start sending mail to it.
- The address has exactly two homes: chat, and the endpoint above. Keep it out of app code, content, and config.
- If the app should display its own address, have the **app backend** fetch it from the same endpoint at request time (the app runs in this container, so `SERVICE_GATEWAY_URL` / `SERVICE_GATEWAY_API_KEY` are in `process.env`) and return it from an endpoint the frontend queries. Backend only — never expose the gateway key to the frontend.
- A `503` from this endpoint means inbound email is not configured on this deployment. Say so plainly; don't invent an address.

### Rotating a leaked or spammed address

```bash
curl -s -X POST "$SERVICE_GATEWAY_URL/external-services/incoming-email/address/regenerate" \
  -H "Authorization: Bearer $SERVICE_GATEWAY_API_KEY"
```

The replacement is immediate and there is no grace period — mail to the old address bounces from that moment. Only regenerate when the user asks (the address leaked, or it is getting spam), and always give them the new one. Already-stored emails are untouched.

## Wiring the app to react in real time

Two steps, both required. Skip either one and mail is still stored — the app just never gets rung.

### 1. Implement the doorbell handler

The app template already ships the stub at `app/backend/src/external-services/external-services.controller.ts`, registered in `app.module.ts`. Replace the empty body:

```typescript
@Post("incoming-email")
async incomingEmail(@Body() notification: DoorbellNotification): Promise<{ received: true }> {
  await this.inboundEmailService.process(notification.rowIds)
  return { received: true }
}
```

The contract:

- Body is **notification-only**: `{ "service": "incoming-email", "rowIds": [12, 13] }`. No email content rides the POST — read the rows from SQLite (below). That way the live path and the catch-up path run the same code.
- **Single fire-and-forget attempt, ~10 s timeout, no retries.** A cold or absent pod is simply missed; the platform does not wake the pod for it.
- **Return 2xx quickly.** A 2xx is what stamps `app_delivered_at` on those rows. If the handler is slow, errors, or the pod is down, the rows stay `app_delivered_at IS NULL` and are picked up by the catch-up read.
- **Make processing idempotent.** A row can be handed to the app more than once (e.g. the handler finished but the response never landed). Key your own app data off the email's row `id` — a `UNIQUE` column in `app.db` — rather than trusting the doorbell to fire exactly once.

### 2. Declare the capability in `app.meta.json`

The platform only rings apps that ask for it:

```json
{"name": "Receipt Inbox", "description": "Logs receipts emailed in", "externalServices": ["incoming-email"]}
```

**Merge this key into the existing file — never rewrite the file from scratch.** Keep the current `name`, `description`, and any other keys exactly as they are. The declaration reaches the platform on the next metadata push (a few seconds); until then rows are stored but no doorbell fires.

## Reading stored emails

`/workspace/data/external-services.db` — **the platform backend is the only writer.** Open it read-only from app code and from the shell; never create tables, write, or point a migration at it. (See the `sqlite` skill for the wider read-only-platform-database rules; the app's own data still lives in `app.db`.)

`incoming_emails` — one row per email:

| Column | Notes |
|---|---|
| `id` | the value that arrives in the doorbell's `rowIds` |
| `received_at`, `raw_payload`, `app_delivered_at` | platform convention columns |
| `provider_message_id` | `UNIQUE` — a redelivered or replayed email is a no-op, not a duplicate row |
| `recipient` | the address the mail was sent to (lowercase) |
| `sender`, `from_header` | envelope sender, and the raw `From:` header |
| `subject` | |
| `body_plain`, `body_html`, `stripped_text` | `stripped_text` is the body with quoted replies and signatures removed — usually the best field to parse |
| `message_headers` | full header list as JSON |

`email_attachments` — zero or more per email, bytes stored inline:

| Column | Notes |
|---|---|
| `incoming_email_id` | FK to `incoming_emails.id` |
| `filename`, `content_type`, `size_bytes` | select these without `content` to list attachments cheaply |
| `content` | the raw bytes (`BLOB`) |

The tables are created lazily the first time mail arrives for the environment. Before that the file is a valid but **empty** database — a query for `incoming_emails` fails with "no such table", which means "no mail yet", not a broken setup.

```typescript
import { DatabaseSync } from "node:sqlite"

const inbound = new DatabaseSync("/workspace/data/external-services.db", { readOnly: true })

const emails = inbound
  .prepare("SELECT id, received_at, sender, subject, stripped_text FROM incoming_emails WHERE id IN (?, ?)")
  .all(...rowIds)

const attachments = inbound
  .prepare("SELECT id, filename, content_type, size_bytes FROM email_attachments WHERE incoming_email_id = ?")
  .all(emailId)

const { content } = inbound
  .prepare("SELECT content FROM email_attachments WHERE id = ?")
  .get(attachmentId) as { content: Uint8Array }
```

**Catching up** — the same read, driven by the undelivered marker instead of `rowIds`. Worth running on boot and from a `schedules` job, so a missed doorbell is invisible to the user:

```sql
SELECT * FROM incoming_emails WHERE app_delivered_at IS NULL ORDER BY id;
```

`app_delivered_at` is backend-owned — the app does not write it, and it stays `NULL` until a doorbell POST gets a 2xx. Keep your own "processed" marker in `app.db` if you need certainty about what the app has actually handled.

### Debugging inbound mail

Inspect from the shell without touching app code:

```bash
sqlite3 -readonly -header -column /workspace/data/external-services.db \
  "SELECT id, received_at, sender, subject, app_delivered_at FROM incoming_emails ORDER BY id DESC LIMIT 10;"
```

- **No rows at all** → the mail never reached this environment. Confirm the sender used the address the endpoint returns *now* (it may have been regenerated, and mail to a dead or unknown address is permanently rejected — the sender gets a bounce).
- **Rows exist, `app_delivered_at` is NULL** → storage worked, the app was not (successfully) rung. Check the declaration in `app.meta.json`, that the handler is implemented and returns 2xx, and whether the pod was up when the mail landed.
- Rows are also browsable in the DB viewer, which serves `external-services.db` read-only alongside the other databases.
