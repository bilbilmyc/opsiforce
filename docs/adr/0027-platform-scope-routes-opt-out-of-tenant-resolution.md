# Platform-scope routes opt out of tenant resolution

Status: accepted

Every permission role (`role:opsiforce_can_*`) is already user-global — tenant scoping has never lived in the permission itself, but in the global `TenantGuard`, which requires membership in the requested tenant and stamps `request.tenantContext` for services to filter by. The first cross-Organization view (the Admin **Storage** page) therefore needs no new kind of permission — it needs a route that skips tenant resolution while still demanding a permission. We introduce a `@PlatformScope()` decorator that `TenantGuard` recognizes: the request must still carry `x-forwarded-groups` (it stays an authenticated-human route), but no tenant membership is required — the guard resolves no tenant and stamps no `tenantContext`, so `@CurrentTenant()` is never used on such routes. Holding the route's permission is the only requirement; membership in ≥1 tenant is deliberately **not** required, since "any one tenant" means nothing for a view that spans all of them.

## Considered Options

- **Reuse `@Public()`** — mechanically sufficient (`PermissionGuard` still runs), but `@Public` marks unauthenticated machine routes (webhooks, agent callbacks, health); overloading it would make a permission-gated human view look unauthenticated.
- **Special-case the permission inside `TenantGuard`** — invisible at the controller; the route's scope should be declared where the route is defined.

## Consequences

- Platform-scope permissions follow the naming precedent of `can_manage_platform_defaults`: the `platform_` segment marks the cross-Organization scope (first instance: `can_view_platform_storage`).
- Each platform-scope permission gets its own standalone Keycloak group (first: `opsiforce_view_platform_storage`), listed in `OPSIFORCE_ALL_PERMISSIONS` but excluded from `OPSIFORCE_ADMIN_GROUP_PERMISSIONS` — same pattern as the external-services permissions, so the default admin bundle never grants cross-Organization visibility.
- The standalone Quickstart's `static` auth mode mirrors every `Perms` value, so the local single-operator dev deployment holds platform-scope permissions automatically. This is accepted.
- There is no "super admin" concept: the system keeps flat permissions, and cross-Organization capability is a property of individual permissions, not of a role.
