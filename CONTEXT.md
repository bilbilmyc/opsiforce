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

**Resources**:
The CPU/memory size of a Project's agent pod, chosen as a class — Small, Medium, Large, or Custom. A project-level policy: one choice applies to every one of the Project's ProjectEnvironment pods (Development and any published target alike).
_Avoid_: Pod class (the internal identifier — never user-facing); Environment size (collides with Environment); Tier, Machine size, Compute (non-canonical — say Resources)

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
