# Settings

`/settings` is the Organization's admin surface — one permission-gated page with a left rail, replacing the old avatar-dropdown links and the "Tenant Settings" modal.

> **Organization** is the user-facing name for the internal **tenant** (`tenants` table, `*_tenant_*` permissions, API). Only the UI says Organization — see `CONTEXT.md`.

## Sections

A grouped rail, one section per area:

- **Access** — Workspaces, Users
- **Configuration** — Environments (the publish-target registry), Integrations (Makara mapping), Defaults (timeouts/budgets seeded into new projects)
- **Billing** — spend and budget

Schedules is **not** here — it's operational, project-scoped runtime data, so it stays top-level.

## Shape & gating

Layout: `[ project sidebar ] [ Settings rail ] [ section content ]`. Each section is its own route (`/settings/billing`, …), so refresh and deep-links keep the active tab; each renders through the shared `SettingsSection` header (icon, title, optional action, description).

Gating is centralised in the layout route: the rail shows only sections the member may manage, `/settings` and any forbidden tab redirect to the first permitted one, and a member with none is sent home (the dropdown hides Settings too). The backend gates the matching endpoints, so a hidden section is also a refused call.

## Code

- `routes/settings/` (layout + gating) and `components/settings/` (rail, section header).
- `constants/settings-tabs.tsx` — the ordered section list (label, group, icon, permission); the single source for the rail, the redirects, and the dropdown's Settings check.
- Section bodies: `pages/{workspaces,users,environments,integrations,defaults,billing}.tsx`.

## Related

[Permissions](permissions.md) · [Tenant Settings](tenant-settings.md) (Integrations) · [Environments](environments.md) · [Defaults](defaults.md) · [Schedules](schedules.md)
