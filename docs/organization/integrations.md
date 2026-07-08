# Integrations (managed-auth tenant mapping)

> Why a tenant stores an explicit mapping from its Organization to its name in the platform's managed identity provider. Surfaced in the UI as the **Integrations** section of [Settings](settings.md); the table and APIs keep the internal `tenant_settings` name.

When App Auth runs in **managed** mode, an Organization is backed by a tenant in the platform's shared identity provider — and that tenant may be named differently there than the Organization is named in Opsiforce. A project configured with managed auth gets a Traefik OIDC middleware asserting a tenant-scoped realm role (the configured role prefix, `MANAGED_TENANT_ROLE_PREFIX`, plus the external tenant name) — that name must match how the user's tenant is named in the identity provider.

The Organization's Opsiforce name and its external tenant name are **not always identical**. Managed auth previously assumed they were; the `tenant_settings` table stores the explicit mapping (`external_tenant_name`) so it resolves the right counterpart instead of guessing. The table is designed to accumulate more cross-tenant configuration over time — today it holds just this one value.

## How it works

A tenant admin opens **Settings → Integrations** and picks the corresponding external tenant from a dropdown whose options come from the user's own group memberships (parsed from `/oauth2/userinfo`'s `groups`, filtered by the configured role prefix) — so they can only pick a tenant they belong to, and the backend re-validates against `X-Forwarded-Groups` on save. When the mapping changes, every project in the tenant currently using managed auth is re-synced in the background via the `managed-auth-sync` BullMQ queue (one job per project, deterministic job id so rapid resaves collapse, failures isolated per project).

## Who can use it

Reading the mapping is open to any tenant member (it isn't sensitive — it already appears as a public role assertion). Changing it is gated by a dedicated manage-integration permission. Existing tenants were backfilled with `external_tenant_name = tenants.name` (the legacy assumption), and new tenants get a row in the same transaction as the tenant, so the resolver needs no fallback in steady state.

## See also

- [Settings](settings.md) — the surface this is a section of.
- [Permissions](permissions.md) — the manage-integration permission that gates changes.
- Code: `backend/src/tenant-settings/`; helpers in `backend/src/tenant/tenant.service.ts` (`getTenantByExternalName`, `parseGroupsByPrefix`); integration point `backend/src/project/project.service.ts`; frontend `frontend/src/pages/integrations.tsx`.
