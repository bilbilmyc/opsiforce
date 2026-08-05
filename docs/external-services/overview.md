# External Services

> How the platform lets an app **receive** things from the outside world — email, WhatsApp messages, and whatever comes next. Read this first: it covers the shared template every inbound service plugs into, and the per-service docs assume it.

Apps built on Opsiforce could always be *talked to* — through their UI or a schedule — but nothing could reach *in*. External Services is the inbound half: a third party posts to the platform, the platform works out which ProjectEnvironment the message belongs to, stores it durably where that environment's app and agent can read it, counts it for the Organization, and — if the app asked to be told — rings the app so it can react immediately.

**Naming.** *External Services* is the umbrella for the **inbound** domain (this doc). The [Service Gateway](../gateways/service-gateway.md) remains the **outbound** seam — the per-project credential broker agents call *out* through. They meet only in one place: the environment-scoped endpoints an agent uses to ask about its own inbound wiring ride the gateway's token, because it already resolves "which environment is calling".

Two services ship today, and they exist as much to prove the template's generality as to be useful:

- [Incoming email](incoming-email.md) — every environment can get its own random receiving address; mail to it (attachments included) lands in the environment's database.
- [WhatsApp](whatsapp.md) — an operator connects a WhatsApp number per Organization and allowlists which chats feed which environments.

## The template

Everything inbound lives in one backend module. A service is not a new subsystem; it is one **service definition** object registered by name — the same shape as the outbound gateway's provider registry. A definition declares its name, how to verify a request, how to pull routing keys out of a payload, how to turn a payload into rows, its SQLite table names and DDL migrations, the app callback path, its skill, what to do when a message routes nowhere, and optionally what publish should carry forward. The module supplies the rest: the HTTP front door, storage, metering, the callback, and the publish hook.

The front door is a single route family — `POST /api/webhooks/<service>` — public (providers have no platform session) and dispatched by the registry, so an unknown service name is a 404 and adding a service adds no controller. Signature verification deliberately needs **no raw-body capture**: Mailgun signs only two form fields, and Whapi doesn't sign at all (it echoes a secret header we chose), so parsed fields plus shared secrets are enough. Requests arrive as either parsed form fields or JSON, normalised into one shape (`headers`, `fields`, `files`, `json`) before a definition sees them.

## What happens when a message arrives

The request path is deliberately synchronous and short — verify, route, store, meter, **200** — and the app callback is dispatched *after* the acknowledgement, as a single fire-and-forget attempt:

```
provider ──POST /api/webhooks/<service>──▶ verify (signature / shared secret)
                                             │ fails ⇒ 406, nothing stored
                                             ▼
                                          routing keys ⇒ ProjectEnvironment(s)
                                             │ nothing matches ⇒ 406 or 200-and-drop
                                             ▼            (per-service posture)
                                          store rows in the env's external-services.db
                                             │  (one transaction, media/attachments included)
                                             ▼
                                          meter: +1 per stored message
                                             │
                                             ▼
                                          200 ──▶ provider is done
                                             ┆
                                             ┆ after the ACK, once, unretried
                                             ▼
                                          doorbell: POST the app, stamp app_delivered_at
```

Three properties follow from that shape and explain most of the behaviour below.

**The ACK is about storage, not about the app.** Once a row is written the handler answers 200 whatever happens next, because a non-2xx would make the provider redeliver and the row would land twice. That also means provider retries can never be used to re-attempt the callback.

**Junk dies before storage.** Verification runs first, so unsigned or mis-signed traffic never touches a tenant database or a counter. That is the whole abuse posture: there is no rate limiting and no platform-side size cap (provider caps bound it — Mailgun's 25 MB message limit, whatever Whapi allows for media), because validly-signed volume is legitimate traffic and metering already records it.

**Routing outcomes are never 5xx.** A message that routes nowhere is a permanent condition — the sender is wrong, not the platform — so the two services differ only in how loudly they say so: email rejects with 406 (Mailgun turns that into a bounce and stops retrying), WhatsApp accepts and drops (Whapi has no permanent-reject, so anything else would just buy pointless retries). Ingest is likewise **status-blind**: a stopped, suspended or disabled environment still gets its mail stored, because losing messages while a pod is idle would be the worse failure. Only a *missing routing row* rejects.

## Storage: one database per environment

Each ProjectEnvironment gets `data/external-services.db` alongside its workspace — one file for all services, one typed table per service inside it. It is deliberately **not** the observability `database.db` (whose whole point is being disposable, and which the request logger already writes to) and **not** the app's own `app.db` (platform tables inside the app's migration story). The **backend is the sole writer**; the agent, the app, and the DB viewer read only. The environment entrypoint seeds the file so [Datasette](../runtime/pod-tools.md) can serve it as a third read-only database, and the `sqlite` agent skill documents it.

Schema is applied lazily: each definition carries a numbered list of DDL statements, the applied count per service is tracked in a `_schema_versions` table inside the file, and the first write applies whatever is missing. Migrations are applied-once-never-edited, exactly like the app template's. A brand-new environment therefore has an *empty* file until its first message — that is normal, not a fault.

Every service table shares four convention columns — `id`, `received_at`, `raw_payload`, `app_delivered_at` — and then whatever that service's messages actually have. Uniformity lives in the convention, not in a generic JSON blob table, so readers get real columns to query. Attachments and media are stored **inline as BLOBs** with `filename` / `content_type` / `size_bytes` beside the bytes, so a reader can inspect what arrived without pulling the payload; storing by reference was rejected because it breaks the single-transaction guarantee and invents orphan-file cleanup for every reader.

Idempotency is the data itself: every table has a `UNIQUE` index on the provider's message id and inserts ignore conflicts. A replayed or redelivered POST therefore acknowledges 200, writes nothing, meters nothing, and rings no doorbell — no token cache, no TTLs, no extra infrastructure.

## The doorbell

The app callback is a **notification, not a delivery**: `POST /api/external-services/<service>` on the app with `{ service, rowIds }` and no message content. The app reads the rows from its read-only SQLite, which means the table schema is the entire data contract, and the live path exercises the same read code as catching up after downtime. Apps opt in by declaring the service in `app.meta.json`; that declaration rides the normal app-metadata push into the environment's App row ([Project Apps](../projects/project-apps.md), [ADR-0016](../adr/0016-app-details-are-per-environment.md)) and gates **only** the callback — storage and metering happen whether or not anyone declared anything.

The call goes straight to the pod inside the cluster with a modest timeout, so it is unreachable from the internet and a cold or absent pod simply means the attempt is skipped. On 2xx the platform stamps `app_delivered_at`; on anything else — non-2xx, timeout, no pod, no declaration — the row keeps `app_delivered_at NULL`, and that null *is* the "never delivered" marker. There are no retries in v1 and a missed doorbell is not data loss: the row is already stored, apps catch up by selecting undelivered rows, and the null column is a visible debugging signal in Datasette. If missed callbacks ever start hurting, a queue and worker slot in behind the same seam without the webhook handler changing.

Like [app readiness](../projects/app-readiness.md), the interesting signal is **pushed rather than polled** ([ADR-0015](../adr/0015-app-liveness-pushed-not-polled.md)) — with the difference that this push is explicitly best-effort, and the durable record lives in the environment's database rather than in the ring.

## Metering

Every stored message counts as **one**, in a pre-aggregated monthly bucket per Organization, project, environment and service. Counting only — no bytes, and attachments don't count separately.

The point of the table is that the count **outlives the tenant's data**: the Organization reference is durable, while the project and environment references null out when those are deleted, so a deleted project's history stays attributed to the Organization instead of cascading away with it (deliberately unlike the gateway audit log, which does cascade — audit is not metering). Storage is metered *after* it succeeds, in one atomic increment; if the increment fails the platform logs loudly and still acknowledges, so the invariant is that the counter can only ever **undercount**.

Operators read it under **Admin → Usage** (`/admin/external-services/usage`): a month picker defaulting to the current month, Organization × service totals, expandable to project and environment, with vanished projects and environments rendered as deleted. It is admin-only and gated by its own permission, `can_view_external_services_usage`, granted separately from the admin bundle — as is WhatsApp channel management. Tenants see no usage counts in v1. This is kept well away from Bifrost's LLM `/usage` ([LLM Gateway](../gateways/llm-gateway.md)), which meters spend, not inbound volume.

## Lifecycle

Inbound wiring belongs to a ProjectEnvironment, so it follows that environment:

- **Publish** carries wiring to the published environment as part of the publish path ([ADR-0004](../adr/0004-git-based-incremental-publish.md)): the App's service declaration is copied first, then each service carries what it owns — email issues the published environment its *own* address, WhatsApp copies the chat routes so both Development and the published environment receive. A failure to carry one service's wiring is logged and does not fail the publish.
- **Delete** cascades: the environment's address row and chat routes die with it, so nothing can deliver to a vanished environment. Metering buckets survive.
- **Duplicate and import** copy nothing inbound. A duplicated environment is a new environment id, so it gets a fresh address on first request and no allowlisted chats — allowlisting is a deliberate act, not something to inherit silently. An export never carries an address.

## Adding a service

Write one service definition and one agent skill. Verification, routing-key extraction and payload→row mapping are yours; the front door, the transaction, schema migration, deduplication, metering, the doorbell, the publish hook, Datasette exposure and the admin usage view come for free. If the new service needs operator-side state (credentials, allowlists) it also brings its own table and admin surface, as WhatsApp does — that is the part the template does not try to generalise.

## Future work

- **Delivery guarantees for the doorbell** — a queue and worker behind the existing seam, if `app_delivered_at NULL` rows turn out to matter.
- **Tenant-facing surfaces** — an environment's address and connected chats in the UI, and tenant-visible usage. The data is already tenant-keyed for it.
- **Quotas and billing** on top of metering, which today only counts.
- **More services** — SMS, phone, and so on; the template exists so these are a definition plus a skill.

## See also

- [Incoming email](incoming-email.md) and [WhatsApp](whatsapp.md) — the two shipped services, including operator setup.
- [Service Gateway](../gateways/service-gateway.md) — the outbound seam, and the token the inbound agent-facing endpoints reuse.
- [Project Apps](../projects/project-apps.md) — `app.meta.json`, and the capability declaration that gates the doorbell.
- [Pod Tools](../runtime/pod-tools.md) — Datasette serving `external-services.db` read-only.
- [Persistence](../runtime/persistence.md) — where the environment's data directory lives and what survives a pod swap.
- [Permissions](../organization/permissions.md) — `can_view_external_services_usage`, `can_manage_whapi_channels`.
- Code: `backend/src/external-services/` (front door, registry, ingest, store, doorbell, metering, publish hook, and the two definitions); `backend/src/common/environment-database.ts` (the shared per-environment SQLite writer, also used by the request-log cleanup processor); `incomingEmailAddresses`, `whapiChannels`, `whapiChatRoutes`, `externalServiceUsage`, `projectApps.externalServices` in `backend/db/schema.ts`; agent skills `agent-config/skills/{incoming-email,whatsapp,sqlite}/SKILL.md`; app-side handler stubs in the agent template's `app/backend/src/external-services/`.
