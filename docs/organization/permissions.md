# Permissions

> How RBAC flows from Keycloak to the UI and the backend, why frontend gating is not enforcement, and how to add a permission. Read this before adding any gated feature.

Opsiforce has no "roles" of its own — only flat permission strings (`can_*`), issued through Keycloak groups and forwarded by OAuth2 Proxy.

```
Keycloak realm roles
   │  (group bundles roles like role:opsiforce_can_publish_project)
   ▼
OAuth2 Proxy  ──  x-forwarded-groups header  ──▶  Backend
                                                    │ GET /api/permissions:
                                                    │  keep role:opsiforce_* (drop tenant-name roles),
                                                    │  strip the prefix → ["can_publish_project", …]
                                                    ▼
                                              Frontend usePermissions().hasPermission(...)
```

The canonical list of permission strings is the code, not this doc: backend `Perms` in `backend/src/permission/permission.constants.ts` and frontend `frontend/src/constants/permissions.ts`.

The `OAuth2 Proxy` box above is the `oidc` path the `opsiforce-proxy` chart runs by default for real deployments with an identity provider. The chart also has a `static` auth mode (the standalone local Quickstart uses it): no OAuth2 Proxy, nginx itself injects a fixed local identity — a `test` user in the `local` tenant carrying *every* `can_*` role — directly into `x-forwarded-groups` on backend-bound routes, so the local operator has full access with no identity provider to stand up. The injected role set is the chart's hardcoded mirror of `Object.values(Perms)`; everything downstream of the header is identical to the OIDC path. A few carry rules worth knowing beyond their name — for example `can_manage_workspaces` widens visibility only on `/settings/workspaces` — but those rules live in the features' own docs ([Workspaces](workspaces.md)), not here.

## Frontend gating is not enforcement

This is the load-bearing rule. `GET /api/permissions` powers **UI gating only** — hiding a tab or button. Enforcement is separate and explicit: a route is protected by `@RequirePermission(Perms.x)` (class- or method-level), and the global `PermissionGuard` checks `x-forwarded-groups`.

**A route with no `@RequirePermission` is open to any authenticated member** — the guard allows when it finds no metadata. So frontend-only gating hides the UI while leaving the endpoint reachable. That is exactly how the Schedules admin endpoints were callable by everyone until a class-level guard was added. When you gate a feature, gate the endpoint too.

## Platform-scope permissions

Almost every route is organization-scoped: the global `TenantGuard` requires membership in the requested organization and stamps `request.tenantContext`, which services filter by. A handful of Admin views span *all* organizations, and for those "the current organization" is meaningless. Such a route is marked `@PlatformScope()` — the guard still demands `x-forwarded-groups` (it remains an authenticated-human route) but resolves no organization and stamps no context, so `@CurrentTenant()` must not be used on it. Holding the route's `@RequirePermission` is the only gate. The two discovery endpoints are platform-scope for the same reason — permissions (`GET /api/permissions`) and the caller's organization list (`GET /api/tenants`) both read only the groups header, so neither has any tenant to resolve.

A platform-scope route needing no organization is not the same as the product offering organization-less accounts, and it does not: every account belongs to at least one Organization, and a platform-scope permission is granted *alongside* that membership rather than on its own. The app shell assumes it throughout — the project list, the create menu, the home composer, and the user record behind the name chip are all organization-scoped — so a membership-less account would be stranded by the client's blanket redirect to the permission-denied page long before a platform view rendered. Supporting one is a separate effort, not a side effect of adding a platform-scope view. See [ADR-0027](../adr/0027-platform-scope-routes-opt-out-of-tenant-resolution.md).

The `platform_` segment in the permission name marks this scope (`can_manage_platform_defaults`, `can_view_platform_storage`). Platform-scope permissions get their own standalone Keycloak group and stay out of `OPSIFORCE_ADMIN_GROUP_PERMISSIONS`, so the default admin bundle never grants cross-organization visibility.

## Adding a permission

1. **Pulumi** — add the role to `OPSIFORCE_ALL_PERMISSIONS` (and the admin group if appropriate) and create a group via `createGroupWithRoles()`.
2. **Frontend** — add the constant to `constants/permissions.ts` and gate UI with `hasPermission()`.
3. **Backend** — `GET /permissions` returns the new role automatically (frontend gating works with no backend change), **but to enforce it** add the string to `Perms` and guard the route(s) with `@RequirePermission`. Skipping step 3 leaves the endpoint open regardless of the UI.

## See also

- [Settings](settings.md) / [Admin](admin.md) — how section visibility is centralized and gated.
- Feature docs own their own permission semantics: [Workspaces](workspaces.md), [Project Apps](../projects/project-apps.md), [Project Environments](../projects/environments.md), [Schedules](../projects/schedules.md), [Resources](../runtime/resources.md).
- Code: `backend/src/permission/` (`permission.constants.ts`, `permission.guard.ts`, `@RequirePermission`), `frontend/src/api/permissions.ts`.
