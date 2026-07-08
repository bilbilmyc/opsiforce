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

## Adding a permission

1. **Pulumi** — add the role to `OPSIFORCE_ALL_PERMISSIONS` (and the admin group if appropriate) and create a group via `createGroupWithRoles()`.
2. **Frontend** — add the constant to `constants/permissions.ts` and gate UI with `hasPermission()`.
3. **Backend** — `GET /permissions` returns the new role automatically (frontend gating works with no backend change), **but to enforce it** add the string to `Perms` and guard the route(s) with `@RequirePermission`. Skipping step 3 leaves the endpoint open regardless of the UI.

## See also

- [Settings](settings.md) / [Admin](admin.md) — how section visibility is centralized and gated.
- Feature docs own their own permission semantics: [Workspaces](workspaces.md), [Project Apps](../projects/project-apps.md), [Project Environments](../projects/environments.md), [Schedules](../projects/schedules.md), [Resources](../runtime/resources.md).
- Code: `backend/src/permission/` (`permission.constants.ts`, `permission.guard.ts`, `@RequirePermission`), `frontend/src/api/permissions.ts`.
