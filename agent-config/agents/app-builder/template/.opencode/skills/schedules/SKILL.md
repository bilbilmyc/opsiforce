---
name: schedules
description: Use when the user asks for recurring tasks, cron jobs, scheduled emails/reports, periodic checks, or "run X every Y".
---

# Scheduled Tasks

Register cron-scheduled HTTP callbacks that fire against endpoints in the app you're building. The platform scheduler calls the endpoint internally (intra-cluster), so it does not need to be publicly reachable or handle auth.

## Environment Variables

- `SERVICE_GATEWAY_URL` — base URL for the gateway API
- `SERVICE_GATEWAY_API_KEY` — Bearer token for authentication

## Create a Schedule

**Step 1**: Build the target endpoint in the app first (follow the nestjs-api skill).

**Step 2**: Register the schedule:

```bash
curl -s -X POST "$SERVICE_GATEWAY_URL/schedules" \
  -H "Authorization: Bearer $SERVICE_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily task summary",
    "cronPattern": "0 9 * * *",
    "targetPath": "/api/cron/daily-report",
    "method": "POST"
  }'
```

### Request Body

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | **User-facing display name.** Unique per project, used as upsert key. |
| `cronPattern` | Yes | 5-field cron: `minute hour day-of-month month day-of-week` |
| `targetPath` | Yes | App endpoint path (e.g. `/api/cron/daily-report`) |
| `method` | No | HTTP method. Default: `POST` |
| `body` | No | JSON body sent with the request |
| `headers` | No | Additional headers as `{ "key": "value" }` |

### Naming Rules — IMPORTANT

The `name` is **shown to the user in the UI**. It must be human-readable:

- ✅ **Good**: `"Daily task summary"`, `"Weekly sales report"`, `"Hourly health check"`, `"Monthly invoice reminder"`
- ❌ **Bad**: `"daily-task-summary"`, `"weekly_sales_report"`, `"cron1"`, `"schedule-1"`, `"report"`

Use sentence case with spaces. Be descriptive but concise (3-6 words). The name should make sense to a non-technical user who opens the Schedules page.

### Cron Pattern Examples

| Pattern | Meaning |
|---------|---------|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 9 * * *` | Daily at 9:00 AM |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 0 1 * *` | First day of every month at midnight |

Timezone is captured automatically from the user's browser. Do NOT ask the user about timezone.

## List Schedules

```bash
curl -s "$SERVICE_GATEWAY_URL/schedules" \
  -H "Authorization: Bearer $SERVICE_GATEWAY_API_KEY"
```

## Delete a Schedule

First list schedules to find the id, then delete by id:

```bash
ID=$(curl -s "$SERVICE_GATEWAY_URL/schedules" \
  -H "Authorization: Bearer $SERVICE_GATEWAY_API_KEY" \
  | jq -r '.[] | select(.name == "Daily task summary") | .id')

curl -s -X DELETE "$SERVICE_GATEWAY_URL/schedules/$ID" \
  -H "Authorization: Bearer $SERVICE_GATEWAY_API_KEY"
```

## Sending Emails from Scheduled Endpoints

If the scheduled endpoint needs to send email (e.g. daily reports, notifications), use the **email** skill — NOT nodemailer or any email SDK. The cron endpoint calls the gateway to send:

```typescript
// Inside your cron endpoint handler:
const res = await fetch(process.env.SERVICE_GATEWAY_URL, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.SERVICE_GATEWAY_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    service: "email",
    payload: { to: "user@example.com", subject: "Daily Report", html: "<p>...</p>" },
  }),
});
```

See the `send-email` skill for full details.

### Email Subject and Body — Tone Rules

Write subjects and body text that are **direct, factual, and professional**. No emojis, no casual greetings, no decorative punctuation.

| | Bad ❌ | Good ✅ |
|---|---|---|
| Subject | `☀️ Morning — 2 pending tasks waiting` | `2 pending tasks – April 17` |
| Subject | `Your weekly report is ready! 🎉` | `Weekly report – April 14–20` |
| Body | `Good morning! You have 2 pending tasks today.` | `2 tasks are pending for today.` |
| Body | `Hey! Here's your weekly summary 👋` | `Weekly summary for April 14–20.` |

- Subject: state what it is and a relevant date/count. No greetings, no decoration.
- Body: open with the key fact. No salutation. No sign-off.

## Important Notes

- The scheduler calls `http://<pod-ip>:3000<targetPath>` directly — NOT the public URL. The endpoint does not need auth handling for scheduler traffic.
- If the pod is suspended when a schedule fires, the platform wakes it automatically.
- Build the endpoint first, then register. If you register a schedule for a non-existent endpoint, the scheduler will record HTTP errors.
- Choose descriptive, stable `name` values. The same name upserts the schedule.
- For sending emails from scheduled endpoints, use the `send-email` skill — never install nodemailer or email libraries directly.
