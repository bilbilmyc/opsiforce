# Integrations (Makara mapping)

> Why a tenant stores an explicit Opsiforce→Makara name mapping, and how it's used in both directions. Surfaced in the UI as the **Integrations** section of [Settings](settings.md); the table and APIs keep the internal `tenant_settings` name.

Opsiforce and Makara talk to each other in both directions, and both need to know the *other* side's tenant name:

- **Opsiforce → Makara**: a project configured with Makara auth gets a Traefik OIDC middleware asserting the realm role `makara_tenant_name_<name>` — `<name>` must match how the user's Makara tenant is named in Keycloak.
- **Makara → Opsiforce**: Makara fetches a tenant's pinned apps from Opsiforce's internal endpoint, identifying itself with an `X-Tenant-Name` header.

The two tenant names are **not always identical**. Both sides previously assumed they were; the `tenant_settings` table stores the explicit mapping so each direction resolves the right counterpart instead of guessing. The table is designed to accumulate more cross-tenant configuration over time — today it holds just this one value.

## How it works

A tenant admin opens **Settings → Integrations** and picks the corresponding Makara organization from a dropdown whose options come from the user's own Makara group memberships (parsed from `/oauth2/userinfo`'s `groups`, filtered by the Makara role prefix) — so they can only pick a Makara tenant they belong to, and the backend re-validates against `X-Forwarded-Groups` on save. When the mapping changes, every project in the tenant currently using Makara auth is re-synced in the background via the `makara-auth-sync` BullMQ queue (one job per project, deterministic job id so rapid resaves collapse, failures isolated per project).

## Who can use it

Reading the mapping is open to any tenant member (it isn't sensitive — it already appears as a public role assertion, and the pin dialog uses it to label the destination). Changing it is gated by `can_manage_makara_integration`. Existing tenants were backfilled with `makara_tenant_name = tenants.name` (the legacy assumption), and new tenants get a row in the same transaction as the tenant, so the resolver needs no fallback in steady state.

## See also

- [Settings](settings.md) — the surface this is a section of.
- [Project Apps](../projects/project-apps.md) — pinning relies on this mapping for the reverse lookup.
- [Permissions](permissions.md) — `can_manage_makara_integration`.
- Code: `backend/src/tenant-settings/`; helpers in `backend/src/tenant/tenant.service.ts` (`getTenantByMakaraName`, `parseMakaraTenantGroups`); integration points `backend/src/internal/apps.controller.ts` and `backend/src/project/project.service.ts`; frontend `frontend/src/pages/integrations.tsx`.
