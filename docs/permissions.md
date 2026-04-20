# Permissions

Role-based access control for Opsiforce, powered by Keycloak realm roles forwarded via OAuth2 Proxy.

---

## Architecture

```
Keycloak (realm roles)
  │
  ▼
OAuth2 Proxy (x-forwarded-groups header)
  │  e.g. "role:opsiforce_can_manage_project_budget_settings,role:opsiforce_tenant_name_acme"
  ▼
Backend (GET /api/permissions)
  │  Strips "role:opsiforce_" prefix, excludes tenant roles
  │  Returns: ["can_manage_project_budget_settings"]
  ▼
Frontend (usePermissions hook)
     hasPermission("can_manage_project_budget_settings") → true/false
```

---

## Permissions

| Keycloak Role | Frontend Constant | Controls |
|---|---|---|
| `opsiforce_can_manage_project_budget_settings` | `Permission.manageProjectBudgetSettings` | Budgets tab in project settings |
| `opsiforce_can_manage_project_timeout_settings` | `Permission.manageProjectTimeoutSettings` | Timeouts tab in project settings |
| `opsiforce_can_manage_platform_defaults` | `Permission.managePlatformDefaults` | Platform Defaults tab (global timeouts, budgets, agent) |
| `opsiforce_can_manage_tenant_defaults` | `Permission.manageTenantDefaults` | Tenant Defaults tab (per-tenant timeouts, budgets, agent) |
| `opsiforce_can_view_code_tab` | `Permission.viewCodeTab` | VS Code IDE tab in project view |
| `opsiforce_can_view_db_tab` | `Permission.viewDbTab` | Datasette DB viewer tab in project view |
| `opsiforce_can_disable_project` | `Permission.disableProject` | Disable/enable projects |
| `opsiforce_can_duplicate_project` | `Permission.duplicateProject` | Duplicate projects |
| `opsiforce_can_view_queue_dashboard` | — (backend-only) | BullMQ queue dashboard at `/api/admin/queues` |
| `opsiforce_can_manage_workspaces` | `Permission.manageWorkspaces` | Create/edit/delete workspaces; add & remove members; unassign projects (move to/from the admin-only Unassigned bucket); see the top "+" create-unassigned-project button; access `/settings/workspaces`; see `GET /users` (member picker) |
| `opsiforce_can_move_projects_between_workspaces` | `Permission.moveProjectsBetweenWorkspaces` | Drag a project between two workspaces the user is a member of (neither source nor destination may be the Unassigned bucket). Does **not** imply `manage_workspaces` |

---

## Keycloak Groups

Groups bundle permissions for easy user assignment. Managed via Pulumi in `packages/infra/pulumi/keycloak-configurator/opsiforce/`.

| Group | Permissions | Description |
|---|---|---|
| `opsiforce_admin` | All permissions | Full access |
| `opsiforce_manage_project_budget_settings` | `can_manage_project_budget_settings` | Budget settings only |
| `opsiforce_manage_project_timeout_settings` | `can_manage_project_timeout_settings` | Timeout settings only |
| `opsiforce_view_code_tab` | `can_view_code_tab` | Code tab only |
| `opsiforce_view_db_tab` | `can_view_db_tab` | DB viewer tab only |
| `opsiforce_disable_project` | `can_disable_project` | Disable/enable projects |
| `opsiforce_duplicate_project` | `can_duplicate_project` | Duplicate projects |
| `opsiforce_view_queue_dashboard` | `can_view_queue_dashboard` | Queue dashboard access |
| `opsiforce_manage_workspaces` | `can_manage_workspaces` | Workspace admin (create/edit/delete, members, Unassigned) |
| `opsiforce_move_projects_between_workspaces` | `can_move_projects_between_workspaces` | Reassign projects between workspaces the user belongs to |

---

## Frontend Usage

Permissions are fetched once on app load and cached.

```tsx
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"

const { hasPermission } = usePermissions()

// Gate a component
<Show when={hasPermission(Permission.manageProjectBudgetSettings)}>
  <BudgetTab />
</Show>
```

**Visibility rules:**
- **Settings dropdown item** — hidden when user has neither budget nor timeout permission
- **Settings dialog tabs** — each tab shown only if user has the corresponding permission; default tab is the first available one
- **Chat/Code/DB tab bar** — entire bar hidden when user lacks both `can_view_code_tab` and `can_view_db_tab` (user sees chat only, no tab switcher). Individual Code / DB tabs are hidden based on their respective permissions.

---

## Backend

`GET /api/permissions` — returns the current user's permission strings.

Parses the `x-forwarded-groups` header, filters for `role:opsiforce_` prefixed entries (excluding `role:opsiforce_tenant_name_` tenant roles), and strips the prefix.

---

## Adding a New Permission

1. **Pulumi** — add the role string to `OPSIFORCE_ALL_PERMISSIONS` in `opsiforce/permissions.ts`, add it to `OPSIFORCE_ADMIN_GROUP_PERMISSIONS` if admins should have it, and create a group in `opsiforce.ts` via `createGroupWithRoles()`
2. **Frontend** — add the constant to `constants/permissions.ts`, use `hasPermission()` to gate UI
3. **No backend changes needed** — the `/permissions` endpoint dynamically returns all `opsiforce_` roles from the header

---

## Pulumi Files

| File | Purpose |
|---|---|
| `keycloak-configurator/opsiforce/permissions.ts` | Permission string constants and group definitions |
| `keycloak-configurator/opsiforce/opsiforce.ts` | Keycloak client, roles, groups, test user setup |
| `keycloak-configurator/utils.ts` | Shared `createGroupWithRoles()` helper |
