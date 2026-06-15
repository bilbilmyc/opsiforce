# Opsiforce

AI coding-assistant platform: users converse with an agent inside a Kubernetes pod to build apps, and can promote those apps from a working environment to production-like environments.

## Language

### Projects & Environments

**Project**:
The durable shell a user owns — identity, ownership, and cross-environment policy. It holds no running state of its own; it groups one or more ProjectEnvironments.
_Avoid_: App (a Project is not the thing that gets built; see App)

**Environment**:
A tenant-scoped, named target a Project can run in (name + description). Every tenant has two protected Environments — **Development** and **Production** — created with the tenant; admins add others (e.g. Staging). A protected Environment cannot be renamed or deleted. The set of Environments is the list of publish targets offered to every Project in the tenant.
_Avoid_: Tier, Target, Deployment target

**Environment Slug**:
The short, immutable, URL-safe identifier an Environment carries alongside its name, shown as the environment suffix in an App's public URL. Fixed for the protected Environments (`dev` for Development, `prod` for Production); for a custom Environment it is prefilled from the whole name at creation and editable that one time before saving (it must be unique within the tenant), then immutable — renames never change it, so published URLs outlive renames. The slug is an identifier, not user-facing copy, so the "avoid Prod" rule does not apply to it.
_Avoid_: Suffix (its position in the URL, not the concept); Short name; Code

**ProjectEnvironment**:
A per-Project instance of an Environment — the thing that actually runs. It owns the runtime state (its files, pod, URLs, and service-gateway key); it shares the Project's LLM virtual keys rather than owning its own. Every Project has one bound to Development; publishing creates additional ones bound to other Environments.
_Avoid_: Instance, Deployment, Env

**Development**:
The default protected Environment present in every tenant. Every Project's working ProjectEnvironment is bound to it. It is never the destination of a publish and cannot be renamed or deleted.
_Avoid_: Dev env, working copy

**Production**:
The second protected Environment present in every tenant — the conventional target for publishing the App's live version. Beyond being guaranteed to exist and protected from rename/delete, it behaves like any other publish target.
_Avoid_: Prod (non-canonical in user-facing copy); Live

**App**:
The application the agent builds inside a ProjectEnvironment, served at its public URL. Distinct from the Project (the shell) — one Project produces one App, which can run in several ProjectEnvironments.
_Avoid_: Project (when you mean the built application)

**App Details**:
The App's human-facing identity — its name and description. First published by the agent when the App goes live, mirrored by the platform, and re-curated by humans afterwards; the running App reads its own name from it at runtime, and Makara's catalog shows the mirrored copy.
_Avoid_: App metadata (vague); Project title (the Project shell's label — a different thing)

**Publish**:
The act of materializing or updating a non-Development ProjectEnvironment from the Development one's files, so the App runs in a chosen Environment. Publishing over an already-running environment is a **Publish update**.
_Avoid_: Deploy, Release, Promote, Redeploy

**Duplicate**:
Creating a new Project in the same tenant and workspace from an existing one, preserving its working state in full — App source and history, the agent conversation, the App's databases, Environment Variables, settings, Resources, and App Details. The duplicate is independent: it gets its own keys, never inherits the source's Pin, and its Schedules arrive **paused** so no automation fires twice. Only the Development ProjectEnvironment is duplicated — published environments are re-created by publishing from the duplicate.
_Avoid_: Copy, Clone, Fork (non-canonical); conflating with Publish (which transports App source only, never working state)

**Active environment**:
The one ProjectEnvironment the project workspace is currently showing — chat, code, DB, and the app pane all follow it. Chosen by clicking an environment in the Environments panel, or via **View environment** after a Publish completes; defaults to Development. Viewing changes nothing about the environment itself — it only re-points the workspace.
_Avoid_: Current env, Selected env (spell out "environment"); conflating with Development (the default, not a synonym)

**Environment Variables**:
The per-ProjectEnvironment configuration values (string keys and values) the App reads when it starts — API keys, base URLs, flags. Each ProjectEnvironment carries its own set; values are set at publish or edited directly per environment, and changes take effect only when the App restarts.
_Avoid_: Secrets (they may hold secrets but are not only secrets); the pod's process env (platform plumbing, a different thing)

**Restart (environment)**:
Recreating a ProjectEnvironment's pod from scratch — the row-level Restart action. Distinct from the lighter **App restart** that applying Environment Variables performs, which restarts only the App's processes inside the running pod.
_Avoid_: Reboot; conflating with App restart

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

### Agents

**Agent**:
The AI coding assistant a user converses with inside a ProjectEnvironment's pod. The platform ships one — **app-builder** — as the default. An Agent is a profile: identity, instructions, skills, and the Model it runs on.
_Avoid_: Bot, Assistant (non-canonical)

**Agent Model**:
The LLM an Agent runs on. A platform-level property of the Agent profile, uniform across every tenant and Project — not a tenant- or project-configurable setting. Changing it is a platform rollout, not a default anyone tunes.
_Avoid_: Default model (it is **not** a configurable default — Defaults covers timeouts and budgets only)

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
