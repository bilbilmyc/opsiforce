---
name: whatsapp
description: Let the app RECEIVE WhatsApp messages — texts, photos, documents and voice notes from allowlisted individual chats and groups. Use when the user wants to send data to their app over WhatsApp, log a group's messages, or asks why WhatsApp messages are not arriving. This is INBOUND only — the app cannot send or reply on WhatsApp.
---

# WhatsApp

A WhatsApp number connected to the platform can feed messages into an app. Messages from **allowlisted chats** — an individual conversation or a group — are received by the platform, stored durably in the environment's `external-services.db` (media **bytes included**), and, if the app declares the capability, the platform rings a "doorbell" endpoint on the app so it can react immediately.

Storage does not depend on the app: messages land in SQLite even while the pod is stopped, the handler is unimplemented, or the app is broken. Nothing is lost; the app catches up by reading rows it has not processed.

**Inbound only.** The app cannot send WhatsApp messages or reply in the chat — there is no outbound WhatsApp path in the platform. If the user wants the app to answer in WhatsApp, say so plainly and offer an in-app alternative (a dashboard, a status page, a notification list).

## Connecting a number and a chat is platform-admin work — you cannot do it

This is the important difference from `incoming-email`, where the app fetches its own address. **There is no endpoint that lets you connect a WhatsApp number, allowlist a chat, or discover which chats are allowlisted.** A platform administrator does that wiring: they connect a WhatsApp number to the platform and allowlist the specific chats — each individual conversation or group — for **this** project environment.

Until a chat is allowlisted to this environment, its messages are received by the platform and silently dropped for this app: nothing appears in `external-services.db`. That is the single most common reason "WhatsApp isn't working".

When the user wants WhatsApp and nothing is wired yet, say plainly that a platform administrator has to connect the number and allowlist their chats to this environment. Everything below — the handler, the declaration, the read code — you can build **before** that happens. Build it, then tell the user what still needs an admin.

### Which chats are already wired

Ask the stored data, not an API — the chats that have ever delivered to this environment are the ones present in the table:

```bash
sqlite3 -readonly -header -column /workspace/data/external-services.db \
  "SELECT chat_id, chat_name, COUNT(*) AS messages, MAX(received_at) AS last_seen
     FROM whatsapp_messages GROUP BY chat_id ORDER BY last_seen DESC;"
```

A chat that has been allowlisted but has never sent anything is invisible this way — absence is not proof it isn't wired. Also note the fan-out: one chat may feed several environments, and **publishing copies the chat routes to the published environment**, so a published app receives the same chats as Development without anyone re-allowlisting.

## Wiring the app to react in real time

Two steps, both required. Skip either one and messages are still stored — the app just never gets rung.

### 1. Implement the doorbell handler

The app template already ships the stub at `app/backend/src/external-services/external-services.controller.ts`, registered in `app.module.ts`. Replace the empty body:

```typescript
@Post("whatsapp")
async whatsapp(@Body() notification: DoorbellNotification): Promise<{ received: true }> {
  await this.whatsappIntakeService.process(notification.rowIds)
  return { received: true }
}
```

The contract:

- Body is **notification-only**: `{ "service": "whatsapp", "rowIds": [12, 13, 14] }`. No message content rides the POST — read the rows from SQLite (below). That way the live path and the catch-up path run the same code.
- **`rowIds` is regularly more than one.** The provider batches several messages into one webhook, so write the handler as a loop over ids from the start.
- **Single fire-and-forget attempt, ~10 s timeout, no retries.** A cold or absent pod is simply missed; the platform does not wake the pod for it.
- **Return 2xx quickly.** A 2xx is what stamps `app_delivered_at` on those rows. If the handler is slow, errors, or the pod is down, the rows stay `app_delivered_at IS NULL` and are picked up by the catch-up read.
- **Make processing idempotent.** A row can be handed to the app more than once (e.g. the handler finished but the response never landed). Key your own app data off the message's row `id` — a `UNIQUE` column in `app.db` — rather than trusting the doorbell to fire exactly once.

### 2. Declare the capability in `app.meta.json`

The platform only rings apps that ask for it:

```json
{"name": "Order Intake", "description": "Logs orders sent over WhatsApp", "externalServices": ["whatsapp"]}
```

**Merge this key into the existing file — never rewrite the file from scratch.** Keep the current `name`, `description`, and any other keys exactly as they are; if the app also receives email, the array holds both (`["incoming-email", "whatsapp"]`). The declaration reaches the platform on the next metadata push (a few seconds); until then rows are stored but no doorbell fires.

## Reading stored messages

`/workspace/data/external-services.db` — **the platform backend is the only writer.** Open it read-only from app code and from the shell; never create tables, write, or point a migration at it. (See the `sqlite` skill for the wider read-only-platform-database rules; the app's own data still lives in `app.db`.)

`whatsapp_messages` — one row per message, media bytes stored inline in the same row:

| Column | Notes |
|---|---|
| `id` | the value that arrives in the doorbell's `rowIds` |
| `received_at`, `raw_payload`, `app_delivered_at` | platform convention columns; `raw_payload` is the provider's full message JSON for anything not broken out below |
| `provider_message_id` | `UNIQUE` — a redelivered or replayed message is a no-op, not a duplicate row |
| `chat_id` | the conversation. Suffix tells you which kind: `…@s.whatsapp.net` = individual, `…@g.us` = group |
| `chat_name` | display name snapshot, may be `NULL` |
| `from_me` | `1` for messages **sent from the connected number itself**, `0` for messages from other people. Filter these out unless you want them |
| `from_number`, `from_name` | the sender — in a group this is the individual member, not the group |
| `type` | `text`, `image`, `document`, `voice`, `video`, … |
| `sent_at` | when the sender sent it (ISO); `received_at` is when the platform stored it |
| `source` | the sender's client (`mobile`, `web`, …) |
| `text_body` | the text of a text message; `NULL` for media |
| `caption` | the caption on a media message — a photo's "text" lives here, not in `text_body` |
| `media_id`, `media_filename`, `media_content_type`, `media_size_bytes` | media metadata; select these without `media_content` to inspect media cheaply |
| `media_content` | the raw bytes (`BLOB`), `NULL` for non-media messages |

Two things worth designing around:

- **`media_content` can be `NULL` on a media message.** The platform fetches the bytes from the provider before storing; if that fetch fails the message is still stored with its metadata and no bytes. Treat missing bytes as a normal case, not a crash.
- **Text is in two columns.** `text_body` for text messages, `caption` for text attached to media. `COALESCE(text_body, caption)` is usually what a search or a list view wants.

The table is created lazily the first time a message arrives for the environment. Before that the file is a valid but **empty** database — a query for `whatsapp_messages` fails with "no such table", which means "no messages yet", not a broken setup.

```typescript
import { DatabaseSync } from "node:sqlite"

const inbound = new DatabaseSync("/workspace/data/external-services.db", { readOnly: true })

const messages = inbound
  .prepare(
    `SELECT id, received_at, chat_id, chat_name, from_number, from_name, type,
            text_body, caption, media_filename, media_content_type, media_size_bytes
       FROM whatsapp_messages
      WHERE id IN (${rowIds.map(() => "?").join(", ")}) AND from_me = 0`
  )
  .all(...rowIds)

const media = inbound
  .prepare("SELECT media_filename, media_content_type, media_content FROM whatsapp_messages WHERE id = ?")
  .get(messageId) as { media_filename: string | null; media_content_type: string | null; media_content: Uint8Array | null }
```

**Catching up** — the same read, driven by the undelivered marker instead of `rowIds`. Worth running on boot and from a `schedules` job, so a missed doorbell is invisible to the user:

```sql
SELECT * FROM whatsapp_messages WHERE app_delivered_at IS NULL ORDER BY id;
```

`app_delivered_at` is backend-owned — the app does not write it, and it stays `NULL` until a doorbell POST gets a 2xx. Keep your own "processed" marker in `app.db` if you need certainty about what the app has actually handled.

### Debugging missing messages

Inspect from the shell without touching app code:

```bash
sqlite3 -readonly -header -column /workspace/data/external-services.db \
  "SELECT id, received_at, chat_id, from_name, type, app_delivered_at
     FROM whatsapp_messages ORDER BY id DESC LIMIT 10;"
```

- **"no such table" or no rows at all** → nothing has ever been routed to this environment. This is platform configuration, not app code: the number may not be connected, or — most likely — **the chat is not allowlisted to this environment**. Tell the user a platform administrator has to fix that; don't debug the handler.
- **Rows from some chats but not the one the user means** → that specific chat is not on the allowlist. Same hand-off.
- **Rows exist, `app_delivered_at` is NULL** → storage worked, the app was not (successfully) rung. Check the declaration in `app.meta.json`, that the handler is implemented and returns 2xx, and whether the pod was up when the message landed. The rows are still there — process them with the catch-up read.
- **A media row with `media_content` NULL** → the provider media fetch failed for that message. The text/metadata is intact; there is no way to re-fetch the bytes from the app.
- Rows are also browsable in the DB viewer, which serves `external-services.db` read-only alongside the other databases.
