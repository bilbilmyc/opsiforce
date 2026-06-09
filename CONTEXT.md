# Opsiforce

AI coding-assistant platform: users converse with an agent inside a Kubernetes pod to build apps, and can promote those apps from a working environment to production-like environments.

## Language

### Projects & Environments

**Project**:
The durable shell a user owns — identity, ownership, and cross-environment policy. It holds no running state of its own; it groups one or more ProjectEnvironments.
_Avoid_: App (a Project is not the thing that gets built; see App)

**Environment**:
A tenant-scoped, named target a Project can run in (name + description). Each tenant has an immutable **Development** by default; admins add others (e.g. Production, Staging). The set of Environments is the list of publish targets offered to every Project in the tenant.
_Avoid_: Tier, Target, Deployment target

**ProjectEnvironment**:
A per-Project instance of an Environment — the thing that actually runs. It owns the runtime state (its files, pod, URLs, and service-gateway key); it shares the Project's LLM virtual keys rather than owning its own. Every Project has one bound to Development; publishing creates additional ones bound to other Environments.
_Avoid_: Instance, Deployment, Env

**Development**:
The single immutable default Environment present in every tenant. Every Project's working ProjectEnvironment is bound to it. It is never the destination of a publish and cannot be renamed or deleted.
_Avoid_: Dev env, working copy

**App**:
The application the agent builds inside a ProjectEnvironment, served at its public URL. Distinct from the Project (the shell) — one Project produces one App, which can run in several ProjectEnvironments.
_Avoid_: Project (when you mean the built application)

**Publish**:
The act of materializing or updating a non-Development ProjectEnvironment from the Development one's files, so the App runs in a chosen Environment.
_Avoid_: Deploy, Release, Promote

**App Auth**:
Per-ProjectEnvironment control over how visitors sign in to the App at that environment's URL — one of **public** (anyone), **manual** (the owner's own OIDC provider), or **makara** (the platform's Keycloak, scoped to the tenant). Each ProjectEnvironment carries its own; a newly published environment is **seeded once** from Development's setting at first publish, then managed independently per environment.
_Avoid_: Project auth (it is not project-wide — each environment has its own); Login, SSO (non-canonical)

**Auth mode**:
The chosen App Auth setting for one ProjectEnvironment — `public`, `manual`, or `makara` (the stored identifier is `auth_mode`).
_Avoid_: Auth type, Auth provider

**Pin (to Makara)**:
Designating the one ProjectEnvironment whose running App represents the Project in the tenant's Makara catalog. A Project has **at most one pin**; pinning another environment moves it. Only a public-auth environment may be pinned. Distinct from Publish (which deploys an environment) — pinning merely exposes an already-running one in the catalog. The App's name/description shown there are project-level (one App), not per-environment.
_Avoid_: Publish, Share, Expose (non-canonical)

**Resources**:
The CPU/memory size of a Project's agent pod, chosen as a class — Small, Medium, Large, or Custom. A project-level policy: one choice applies to every one of the Project's ProjectEnvironment pods (Development and any published target alike).
_Avoid_: Pod class (the internal identifier — never user-facing); Environment size (collides with Environment); Tier, Machine size, Compute (non-canonical — say Resources)

### Schedules

**Schedule**:
A recurring cron job an agent registers against an endpoint in the App, owned by **one ProjectEnvironment** — it fires only against that environment's running App. Publishing copies Development's chosen schedules into the target environment, so a same-named schedule can exist and fire **independently** in several environments (the copies are intentional, not duplicates).
_Avoid_: Cron job (the mechanism, not the domain concept); Job (collides with BullMQ jobs and publish jobs)

### Request Logging

**Request Logging**:
Per-Project control over how much of its App's live traffic the app-mode proxy records to the Project's request log. Owner-set policy, alongside Resources, budgets, and timeouts.
_Avoid_: Access logging, tracing, audit log

**Logging level**:
The chosen verbosity — Off (record nothing), Metadata (method, path, status, latency, size, redacted headers; no bodies), or Full (metadata plus a bounded prefix of each body). An ordered scale from least to most recorded.
_Avoid_: Mode (the stored identifier `request_log_mode`); log level (in the DEBUG/INFO sense)

**Body limit**:
The byte cap on how much of each request/response body the Full level captures before truncating. The log holds a prefix, never the whole body.
_Avoid_: Buffer size, max body size (collides with upload limits)
