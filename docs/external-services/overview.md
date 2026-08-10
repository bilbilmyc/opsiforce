# External Services

> How the platform lets an app **receive** things from the outside world — email, WhatsApp messages, and whatever comes next. Read this first: it covers the shared template every inbound service plugs into, and the per-service docs assume it.

Apps built on Opsiforce could always be *talked to* — through their UI or a schedule — but nothing could reach *in*. External Services is the inbound half: a third party posts to the platform, the platform works out which ProjectEnvironment the message belongs to, stores it durably where that environment's app and agent can read it, counts it for the Organization, and rings the app so it can react immediately.

**Naming.** *External Services* is the umbrella for the **inbound** domain (this doc). The [Service Gateway](../gateways/service-gateway.md) remains the **outbound** seam — the per-project credential broker agents call *out* through. They meet only in one place: the environment-scoped endpoints an agent uses to ask about its own inbound wiring ride the gateway's token, because it already resolves "which environment is calling".

Two services ship today, and they exist as much to prove the template's generality as to be useful:

- [Incoming email](incoming-email.md) — every environment can get its own random receiving address; mail to it (attachments included) lands in the environment's database.
- [WhatsApp](whatsapp.md) — an operator registers a WhatsApp number once for the platform and allowlists which chats feed which environments.

## The template

Everything inbound lives in one backend module. A service is not a new subsystem; it is one **service definition** object registered by name — the same shape as the outbound gateway's provider registry. A definition declares its name and human label, how to verify a request, how to pull routing keys out of a payload, how to turn a payload into rows, what to do when a message routes nowhere, how to project an environment's inbound identity, any extra routes it wants, and optionally how to provision a newly created environment and what publish should carry forward. The module supplies the rest: the HTTP front door, storage, metering, the doorbell, and the publish hook.

Registering a service is deliberately two edits and no more: **one definition file, and one line adding its class to the `DEFINITION_CLASSES` barrel**. The module derives its providers from that array mechanically, so there is no second list to keep in sync. Filesystem auto-discovery was rejected — it would fight the TypeScript project graph, dead-code analysis and Nest's dependency injection to save one greppable, type-checked line.

## The route tree

Every endpoint the domain owns lives under `/api/external-services/`, and the **first segment after the prefix is the audience, not the service**. That is what makes authentication a property of the mount rather than of each service:

```
/api/external-services/
├── webhooks/:service     public — the real authentication is the definition's own verify step
├── agent/:service/…      the Service Gateway bearer token; the platform resolves the environment from it
│     └── identity        mounted by the platform for every service
└── admin/:service/…      an operator session plus the external-services management permission
      └── usage           the platform's own aggregate, reserved
```

The admin mount carries **one permission**, `can_manage_external_services`, but its route tables still mix two audiences. A route that names an environment (`environments/:projectEnvironmentId/…`) is an organization's own business, and the dispatcher checks that the environment's project belongs to the caller's tenant before the handler runs — derived from the route's own shape rather than declared per definition, which keeps the guarantee below intact. A route that names no environment reaches the platform-wide resource registry shared by every organization — registering a WhatsApp channel, rotating its secret, deleting it — and has no tenant to check against, so anyone holding the permission manages those resources for every organization. Grant it accordingly: it is a platform-operator permission in practice, which is why it is kept out of the admin bundle and assigned by hand.

Resources are **shared, not owned**, and WhatsApp shows what that buys. A channel is registered once for the whole platform — `externalServiceResource` is keyed by service and resource key with no tenant column at all — and from then on any environment, in any organization, can wire itself to it. Choosing a channel and browsing its chats (`environments/:projectEnvironmentId/available-channels` and `…/channels/:channelId/chats`) therefore answer for every registered channel; the environment in the path is what the dispatcher tenant-checks, not the channel. One number can feed several organizations at once, which is the point: connect it once, then let each environment allowlist the chats it cares about.

Two thin **dispatch controllers** — one for `agent`, one for `admin` — declare their guard once at the class and then hand the remaining path to the addressed definition's route table, a plain list of `method` + `path` + handler entries. Handlers throw ordinary Nest exceptions and return JSON. The consequence worth stating plainly: **a definition cannot misconfigure security.** It never picks a mount, never picks a guard, and the worst thing a buggy route table can do is expose that service's own data to an audience that is already authenticated. Dynamic per-service modules would have handed each definition its own paths and guards and bought nothing in exchange — validation in this backend has always lived in services as plain TypeScript, never in decorator pipes.

Because the audience segments are real path segments, a handful of names belong to the platform: the registry **refuses at startup** to register a definition called `usage`, `webhooks`, `agent`, `admin` or `services`. Failing on boot is the point — a name collision is a deployment mistake, not a runtime condition to negotiate.

Signature verification on the webhook mount deliberately needs **no raw-body capture**: Mailgun signs only two form fields, and Whapi doesn't sign at all (it echoes a secret header we chose), so parsed fields plus shared secrets are enough. Requests arrive as either parsed form fields or JSON, normalised into one shape (`headers`, `fields`, `files`, `json`) before a definition sees them.

## Discovery: asking a service who you are

An agent building an app needs to know its environment's inbound identity — which address will reach it, which chats are wired to it. Rather than one bespoke endpoint per service, **every definition must implement `identity(environmentId)`**, and the platform mounts it at `GET agent/<service>/identity`. A definition cannot ship without one, so a skill can be written once against the pattern and a new service inherits the contract for free.

Two rules keep it usable from a shell script. It **always answers 200** — an environment with nothing configured gets that service's own empty shape (`{"channels": []}`), never a 404, so a skill does one unconditional GET with no status branching. And **secrets never leave**: email projects `{address}`, WhatsApp projects its channels with their labels and allowlisted chats, and the API tokens and webhook secrets behind them stay in the backend.

Discovery is a *read*. Mutations stay explicit and service-declared — rotating an email address is `POST agent/incoming-email/regenerate`, an email-owned route, because rotation is not universal and does not belong inside the call everyone makes on every boot.

## What happens when a message arrives

The request path is deliberately synchronous and short — verify, route, store, meter, **200** — and the app callback is dispatched *after* the acknowledgement, as a single fire-and-forget attempt:

```
provider ──POST /api/external-services/webhooks/<service>──▶ verify (signature / shared secret)
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

Each ProjectEnvironment gets `data/external-services.db` alongside its workspace — one file for all services, and inside it one `messages` table and one `attachments` table shared by every service. It is deliberately **not** the observability `database.db` (whose whole point is being disposable, and which the request logger already writes to) and **not** the app's own `app.db` (platform tables inside the app's migration story). The **backend is the sole writer**; the agent, the app, and the DB viewer read only. The environment entrypoint seeds the file so [Datasette](../runtime/pod-tools.md) can serve it as a third read-only database, and the `sqlite` agent skill documents it.

The schema belongs to the platform, not to the services: the store carries one ordered migration list, the applied version lives in the file's `PRAGMA user_version`, and the first write applies whatever is missing inside the same transaction as the insert. Migrations are applied-once-never-edited, exactly like the app template's, and future changes are additive-only so old and new files stay interreadable during the lazy rollout lag. A brand-new environment therefore has an *empty* file until its first message — that is normal, not a fault. **Adding a service adds no DDL at all**: a definition hands the store a typed message and the store owns every statement.

A stored message carries the bookkeeping columns (`id`, `service`, `received_at`, `raw_payload`, `app_delivered_at`, the provider's message id), a small promoted set that means the same thing for every service — who it was routed to, who sent it, the text — and a `payload` JSON column holding everything service-specific. The promotion line is deliberate: the fields skills query constantly stay real columns, the long tail is reachable through `json_extract` without inventing a wide union table. Attachments and media alike are child rows with `filename` / `content_type` / `size_bytes` beside the bytes, so a reader can inspect what arrived without pulling the payload; storing by reference was rejected because it breaks the single-transaction guarantee and invents orphan-file cleanup for every reader. A media fetch that fails still leaves its row, with the bytes NULL — apps see that a photo existed and is unavailable rather than seeing nothing.

Idempotency is the data itself: a `UNIQUE` index on service plus the provider's message id, and inserts ignore conflicts. A replayed or redelivered POST therefore acknowledges 200, writes nothing, meters nothing, and rings no doorbell — no token cache, no TTLs, no extra infrastructure.

## The doorbell

The app callback is a **notification, not a delivery**: `POST /api/external-services/<service>` on the app with `{ service, rowIds }` and no message content. The app reads the rows from its read-only SQLite, which means the table schema is the entire data contract, and the live path exercises the same read code as catching up after downtime. The URL is derived from the service name by convention, so a definition never declares a callback path.

**It fires unconditionally, for every stored batch.** There is no opt-in: "did the app want this?" is answered by the app's own HTTP response, not by a declaration the platform has to carry around. The template ships one catch-all route that answers **501** for any service, so an app that hasn't implemented a handler says so honestly and its rows stay visibly undelivered; implementing a service means adding a route for that service name, and a new service needs no template change at all. The earlier design — an `externalServices` array in `app.meta.json` pushed into the App row and checked before ringing — is gone, along with the failure mode that made it worth removing: a stub that acked 2xx marked rows delivered for an app that did nothing with them.

The call goes straight to the pod inside the cluster with a modest timeout, so it is unreachable from the internet and a cold or absent pod simply means the attempt is skipped. On 2xx the platform stamps `app_delivered_at`; on anything else — non-2xx, timeout, no pod — the row keeps `app_delivered_at NULL`, and that null *is* the "never delivered" marker. There are no retries in v1 and a missed doorbell is not data loss: the row is already stored, apps catch up by selecting undelivered rows, and the null column is a visible debugging signal in Datasette. If missed callbacks ever start hurting, a queue and worker slot in behind the same seam without the webhook handler changing.

Like [app readiness](../projects/app-readiness.md), the interesting signal is **pushed rather than polled** ([ADR-0015](../adr/0015-app-liveness-pushed-not-polled.md)) — with the difference that this push is explicitly best-effort, and the durable record lives in the environment's database rather than in the ring.

## Metering

Every stored message counts as **one**, in a pre-aggregated monthly bucket per Organization, project, environment and service. Counting only — no bytes, and attachments don't count separately.

The point of the table is that the count **outlives the tenant's data**: the Organization reference is durable, while the project and environment references null out when those are deleted, so a deleted project's history stays attributed to the Organization instead of cascading away with it (deliberately unlike the gateway audit log, which does cascade — audit is not metering). Storage is metered *after* it succeeds, in one atomic increment; if the increment fails the platform logs loudly and still acknowledges, so the invariant is that the counter can only ever **undercount**.

Admins read it under **Admin → Usage** (`/admin/external-services/usage`): a month picker defaulting to the current month, the caller's own organization's totals per service, expandable to project and environment, with vanished projects and environments rendered as deleted. The endpoint binds to the authenticated tenant — unlike the shared channel registry, usage counts and project names are one organization's own business, so no permission grants a cross-organization view. It is gated by its own permission, `can_view_external_services_usage`, granted separately from the admin bundle — as is WhatsApp channel management, which is gated by `can_manage_external_services`. This is kept well away from Bifrost's LLM `/usage` ([LLM Gateway](../gateways/llm-gateway.md)), which meters spend, not inbound volume.

## Lifecycle

Inbound wiring belongs to a ProjectEnvironment, so it follows that environment:

- **Creation** provisions: every seam that creates an environment — project create, duplicate, import, pool pre-warm, publish — calls one shared platform seam that offers the new environment to every definition declaring a provisioning hook. It runs after the environment row is committed (a hook may talk to a provider, which has no business inside a database transaction), and a failure is logged with the service and environment id and never fails the flow: on an unconfigured deployment the environment is simply born unprovisioned for that service.
- **Publish** additionally carries wiring forward as part of the publish path ([ADR-0004](../adr/0004-git-based-incremental-publish.md)): each service carries what it owns — WhatsApp copies the chat routes so both Development and the published environment receive. Email carries nothing: its published environment was provisioned with its own address when it was created. The carry runs **only once the new app version has proven ready**, never before: a publish that fails readiness rolls the app version back but keeps its environment row, so an early carry would leave the rolled-back version receiving messages for chats that were only ever allowlisted for a version that never went live. A failure to carry after readiness is logged and does not fail the publish — the copy is an upsert, so the next publish heals it.
- **Delete** cascades: the environment's per-service configuration documents die with it, so nothing can deliver to a vanished environment. The global resource rows — a WhatsApp channel and its credentials — are not environment-owned and survive. Metering buckets survive too.
- **Duplicate and import** copy nothing inbound. A duplicated environment is a new environment id, so it is provisioned with a fresh address of its own and has no allowlisted chats — allowlisting is a deliberate act, not something to inherit silently. An export never carries an address.

## Adding a service

Write one service definition, add one line to the definitions barrel, and write one agent skill. Verification, routing-key extraction, payload→row mapping and the identity projection are yours; the three mounts and their guards, the transaction, deduplication, metering, the doorbell, the publish hook, Datasette exposure and the admin usage view come for free. Operator-side state and agent-side extras arrive as route-table entries on the same definition — no new controller, no new guard, no new permission.

## Future work

- **Delivery guarantees for the doorbell** — a queue and worker behind the existing seam, if `app_delivered_at NULL` rows turn out to matter.
- **Tenant-facing surfaces** — an environment's address and connected chats in the UI, and tenant-visible usage. The data is already tenant-keyed for it.
- **Quotas and billing** on top of metering, which today only counts.
- **More services** — SMS, phone, and so on; the template exists so these are a definition plus a skill.

## See also

- [Incoming email](incoming-email.md) and [WhatsApp](whatsapp.md) — the two shipped services, including operator setup.
- [Service Gateway](../gateways/service-gateway.md) — the outbound seam, and the token the inbound agent-facing endpoints reuse.
- [Project Apps](../projects/project-apps.md) — `app.meta.json` and the app-details push the doorbell no longer depends on.
- [Pod Tools](../runtime/pod-tools.md) — Datasette serving `external-services.db` read-only.
- [Persistence](../runtime/persistence.md) — where the environment's data directory lives and what survives a pod swap.
- [Permissions](../organization/permissions.md) — `can_view_external_services_usage`, `can_manage_external_services`.
- Code: `backend/src/external-services/` (the four controllers — webhooks, agent dispatch, admin dispatch, usage — plus the registry, route matcher, ingest, stores, doorbell, metering, publish hook, and the two definitions); `backend/src/common/environment-database.ts` (the shared per-environment SQLite writer, also used by the request-log cleanup processor); `externalServiceResource`, `externalServiceConfig`, `externalServiceUsage` in `backend/db/schema.ts`; agent skills `agent-config/skills/{incoming-email,whatsapp,sqlite}/SKILL.md`; app-side handler stubs in the agent template's `app/backend/src/external-services/`.
