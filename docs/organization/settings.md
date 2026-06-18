# Settings

> The Organization's configuration surface — one permission-gated page with a left rail of sections. Read this to understand how Organization-level admin UI is structured and gated.

`/settings` is where a member **configures** the Organization currently chosen in the selector. It replaced the old avatar-dropdown links and the "Tenant Settings" modal with one page whose left rail groups sections by area:

- **Access** — Workspaces, Users
- **Configuration** — Environments (the publish-target registry), Integrations (the Makara mapping), Defaults (timeouts/budgets seeded into new projects)
- **Billing** — spend and budget

Schedules is deliberately **not** here — it's operational, project-scoped runtime data, so it stays top-level. The operational counterpart to Settings is [Admin](admin.md); the configure-vs-operate split is [ADR-0014](../adr/0014-admin-section-and-operational-view-module.md).

## Shape & gating

Layout is `[ project sidebar ] [ Settings rail ] [ section content ]`. Each section is its own route (`/settings/billing`, …) so refresh and deep-links keep the active tab, and each renders through a shared section header. Gating is centralized in the layout route: the rail shows only sections the member may manage, `/settings` and any forbidden tab redirect to the first permitted one, and a member with none is sent home (the dropdown hides Settings too). The backend gates the matching endpoints, so a hidden section is also a refused call — frontend gating is not enforcement (see [Permissions](permissions.md)).

The rail is a single shared component driven by a per-section tab config (label, group, icon, permission); [Admin](admin.md) renders the same component with its own config.

## See also

- [Admin](admin.md) — the operational sibling, same rail ([ADR-0014](../adr/0014-admin-section-and-operational-view-module.md)).
- Section substance: [Integrations](integrations.md) · [Defaults](defaults.md) · [Project Environments](../projects/environments.md) · [Workspaces](workspaces.md).
- Code: `frontend/src/routes/settings/` (layout + gating), `frontend/src/components/section-rail.tsx`, `frontend/src/constants/settings-tabs.tsx` (the single source for rail, redirects, and the dropdown check), section bodies under `frontend/src/pages/`.
