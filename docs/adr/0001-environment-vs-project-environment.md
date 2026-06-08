# Two entities for environments: tenant `Environment` registry vs per-project `ProjectEnvironment`

Status: accepted

We split "environments" into two entities rather than one. An **`Environment`** is a tenant-scoped registry row (`name`, `description`, `isDefault`) — the set of publish targets offered to every project in the tenant, with an immutable **Development** seeded per tenant and others (Production, Staging…) added by admins. A **`ProjectEnvironment`** is a per-project instance that FKs to an `Environment` and owns all *runtime* state — its directory, pod/status/podIp, platformVersion, lastActiveAt, plus per-instance credentials (Bifrost virtual keys, gateway key), `authMode`, and schedules. The **`Project`** becomes a shell: identity (tenant/workspace/agent/title/description), cross-environment policy (a new project-level `disabled` flag), and the project-level budget/timeouts.

We chose two entities over the alternatives (a single `ProjectEnvironment` with free-text names; or a tenant config list of allowed names) so that publish targets are governed tenant-wide and propagate by FK — renaming "Production"→"Prod" once updates every project — while each project's running instances stay independent.

## Consequences

- Most of the old `projects` columns and its satellite tables move to, or re-point their FK to, `ProjectEnvironment`. `project_settings` splits: timeouts+timezone stay on the project, `authMode` moves to the env.
- App identity (`name`/`description`/`icon`) stays per-project; the single Makara pin gains a `pinnedEnvironmentId` so the catalog link resolves to one specific env's URL.
- **Pinning requires the targeted env's `authMode` to be `public`** (the existing precondition, kept for every env). The Makara catalog therefore lists public apps only; a `makara`-authed env is intentionally **not** pinnable. This is a deliberate "no" — to surface a prod app in the catalog, keep that env public; choosing login-gating forgoes catalog pinning.
- Agent-config updates target the **Development** env only — a published env is a frozen snapshot and must not receive live agent-config migrations.
