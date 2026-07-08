# The project sidebar orders by last prompt, not keep-alive activity

Status: accepted

The project sidebar lists a user's Projects in recency order. It ordered by `project_environments.last_active_at` — the Keep-alive activity marker touched on *every* proxied request (the agent surface, VS Code, and DB viewer, plus the deployed App's own traffic), and on file up/download, transcription, pod wake, publish completion, and pool-claim. That column exists to keep pods alive and to drive the Pods view ([ADR-0013](0013-pods-view-reads-live-keepalive-from-redis.md)); using it to sort meant the list reordered whenever a Project was merely *touched* — visiting its App, opening its editor — rather than when the user actually worked in it. We add a dedicated `projects.last_prompt_at`, stamped only when a user sends a Prompt, and order the sidebar by `COALESCE(last_prompt_at, created_at) DESC`. `last_active_at` keeps its keep-alive job and is no longer read for sort.

A Prompt is captured at the one place every user send crosses server-side: the Go agent proxy recognizes `POST /session/:id/prompt(_async)` and fire-and-forgets an internal control-plane call that stamps the Project (resolving env-id → project-id, the resolve `ensure` already performs). The stamp happens on request receipt, does not block the proxied request, and is not throttled — Prompts are naturally seconds-to-minutes apart, unlike the ~1/5s keep-alive touch.

## Why user-send only, the proxy, and a separate column

- **User-send, not "last message."** In interactive use a Prompt and the Agent's reply are seconds apart, so ordering by either yields the same list. The one case they diverge — a long task finishing after the user has moved to another Project — is rare, and capturing "Agent finished" is expensive: it is not a request but a `session.idle` event inside the long-lived `/event` SSE stream, requiring a tee-and-parse we judged not worth it. Only the user's send stamps.
- **The proxy, not the frontend.** The Go proxy is the durable system of record for a send regardless of which client made it; the web frontend is the only client today but should not be the authority for sort order. Server-side capture also keeps both activity concepts (keep-alive and last-prompt) in one layer.
- **A new column, not a repurposed one.** `last_active_at` must count App traffic and pod wakes to do its keep-alive job — exactly the events sort must ignore. The two concepts cannot share a column without one corrupting the other.

## Consequences

- Backfill copies each Project's default-environment `last_active_at` into `last_prompt_at` on migration, so order does not jump on deploy. Rows with a null `last_active_at` — and every Project created afterward, before its first Prompt — fall back to `created_at` through the COALESCE, which also fixes the old NULLS-FIRST quirk where never-activated Projects floated to the top.
- Sorting moves from the joined default-environment row to the Project row, so a Prompt in *any* environment now reorders the sidebar; previously only the default (Development) environment's activity could. The default env is still joined for the `disabled` bucket.
- Duplicate, Import, and pool-claim reset `last_prompt_at` (leave it null) so a freshly obtained Project surfaces at the top by its own `created_at` — the same intent as the pool-claim `created_at` reset.
- The hook is coupled to opencode's `prompt` / `prompt_async` path names; if opencode renames them the sidebar silently stops updating. Only a user Prompt stamps — creating an empty session or aborting a turn does not.
