# Tenant Settings

Per-tenant configuration for Opsiforce. Today it holds a single value — the
**Makara tenant name** this Opsiforce tenant maps to — but the table is
designed to accumulate more cross-tenant configuration over time.

## Why this exists

Opsiforce and Makara talk to each other in both directions:

- **Opsiforce → Makara**: when a project is configured with Makara auth,
  Opsiforce writes a Traefik OIDC middleware that asserts the user has the
  realm role `makara_tenant_name_<name>`. The `<name>` must match how the
  user's Makara tenant is named in Keycloak.
- **Makara → Opsiforce**: Makara fetches the list of apps pinned for a given
  tenant by calling Opsiforce's internal pinned-apps endpoint, identifying
  itself with an `X-Tenant-Name` header.

Previously both sides assumed the Opsiforce tenant name was identical to the
Makara tenant name. They are not always the same. Tenant Settings stores the
explicit mapping so each direction can resolve the correct counterpart name
without guessing.

## How it works

```
       Opsiforce tenant ─┐
                         ├──→ tenant_settings.makara_tenant_name
       Makara tenant ────┘
```

A tenant admin opens **Tenant Settings** from the bottom-left sidebar menu and
picks the corresponding Makara tenant from a dropdown. The dropdown options
come from the user's own Makara group memberships (parsed from
`/oauth2/userinfo`'s `groups` claim, filtered by the Makara role prefix), so
admins can only pick a Makara tenant they actually belong to. The backend
re-validates the same membership against `X-Forwarded-Groups` on save.

When the mapping changes, every project in the tenant currently using Makara
auth is re-applied in the background: a fan-out of one job per project is
enqueued on the `tenant-makara-reapply` BullMQ queue, with a deterministic job
id so rapid resaves collapse into one effective run per project. Each job
rebuilds that project's Traefik middleware with the new Makara name; failures
are logged and don't block siblings.

## Who can use it

Reading the mapping is available to any tenant member — the value is not
sensitive (it already appears as a public role assertion in the Traefik
middleware) and the pin-app dialog uses it to label the destination tenant
for everyone. Changing the mapping is gated by the
`can_manage_makara_integration` Keycloak role. Users without the role still
see the existing pinned-apps and project Makara auth flows working
correctly — they just can't change the mapping.

## Lifecycle

- **Existing tenants** were backfilled at the first migration: every tenant
  got a `tenant_settings` row with `makara_tenant_name = tenants.name`,
  matching the legacy assumption so nothing breaks on the day the table
  appears.
- **New tenants** get a `tenant_settings` row created in the same transaction
  as the tenant row, with the same default. The mapping is non-null at the DB
  level after the follow-up migration, so the resolver doesn't need a
  fallback path in steady state.

## Where the code lives

- Backend module: `backend/src/tenant-settings/` — controller, service,
  module, processor, types.
- Helpers used at integration points: `backend/src/tenant/tenant.service.ts`
  (`getTenantByMakaraName`, `parseMakaraTenantGroups`,
  `doGetOrCreateTenant` insert).
- Integration points: `backend/src/internal/apps.controller.ts` (Makara →
  Opsiforce reverse lookup) and `backend/src/project/project.service.ts`
  (Opsiforce → Makara: resolves the mapped name before
  `applyMakara`).
- Frontend dialog: `frontend/src/components/tenant-settings.tsx`, opened from
  the SidebarFooter dropdown in `app-sidebar.tsx`.
- Frontend hooks: `frontend/src/api/tenant-settings.ts` and the
  `parseMakaraTenants` helper in `frontend/src/api/user.ts`.

## Related

- [Permissions](permissions.md) — how `can_manage_makara_integration` flows
  through Keycloak → oauth2-proxy → backend.
- [Project Apps](project-apps.md) — pinning apps relies on the mapping for
  the reverse lookup.
