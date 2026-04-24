/**
 * Backend permission strings. Mirrors `frontend/src/constants/permissions.ts`.
 * Keep in sync with `packages/infra/pulumi/keycloak-configurator/opsiforce/permissions.ts`.
 */
export const Perms = {
  manageProjectBudgetSettings: "can_manage_project_budget_settings",
  manageProjectTimeoutSettings: "can_manage_project_timeout_settings",
  manageTenantBudget: "can_manage_tenant_budget",
  viewCodeTab: "can_view_code_tab",
  viewDbTab: "can_view_db_tab",
  disableProject: "can_disable_project",
  restartProject: "can_restart_project",
  duplicateProject: "can_duplicate_project",
  manageWorkspaces: "can_manage_workspaces",
  moveProjectsBetweenWorkspaces: "can_move_projects_between_workspaces",
} as const
