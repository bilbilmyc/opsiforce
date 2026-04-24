import { pgTable, text, timestamp, pgEnum, bigint, boolean, jsonb, integer, index, unique, primaryKey } from "drizzle-orm/pg-core"

export const projectStatusEnum = pgEnum("project_status", [
  "starting",
  "active",
  "suspended",
  "disabled",
])

export const podStatusEnum = pgEnum("pod_status", [
  "warm",
  "assigned",
  "terminating",
])

export const keyTypeEnum = pgEnum("key_type", ["chat", "backend"])

export const projectAuthModeEnum = pgEnum("project_auth_mode", ["public", "manual", "makara"])

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  bifrostTenantId: text("bifrost_tenant_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

const tenantIdField = text("tenant_id")
  .references(() => tenants.id)
  .notNull()

export const userWorkspacePreferences = pgTable("user_workspace_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceOrder: jsonb("workspace_order").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  tenantId: tenantIdField,
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.userId] }),
  }),
)

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  tenantId: tenantIdField,
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  title: text("title"),
  description: text("description"),
  directory: text("directory").notNull(),
  status: projectStatusEnum("status").notNull().default("starting"),
  podName: text("pod_name"),
  podIp: text("pod_ip"),
  sessionId: text("session_id"),
  platformVersion: text("platform_version").notNull(),
  bifrostProjectId: text("bifrost_project_id"),
  lastActiveAt: timestamp("last_active_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const projectSettings = pgTable("project_settings", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  timeoutIdle: bigint("timeout_idle", { mode: "number" }).notNull(),
  appTimeoutIdle: bigint("app_timeout_idle", { mode: "number" }).notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  authMode: projectAuthModeEnum("auth_mode").notNull().default("public"),
})

export const projectVirtualKeys = pgTable("project_virtual_keys", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  tenantId: text("tenant_id")
    .references(() => tenants.id)
    .notNull(),
  keyType: keyTypeEnum("key_type").notNull().default("chat"),
  bifrostKeyId: text("bifrost_key_id").notNull(),
  bifrostKeyToken: text("bifrost_key_token").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const deletedProjects = pgTable("deleted_projects", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  directory: text("directory").notNull(),
  deletedAt: timestamp("deleted_at").defaultNow().notNull(),
})

export const projectGatewayKeys = pgTable("project_gateway_keys", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  tenantId: text("tenant_id")
    .references(() => tenants.id)
    .notNull(),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const gatewayAuditLogs = pgTable("gateway_audit_logs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  tenantId: text("tenant_id")
    .references(() => tenants.id)
    .notNull(),
  service: text("service").notNull(),
  status: text("status").notNull(),
  durationMs: bigint("duration_ms", { mode: "number" }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  keycloakId: text("keycloak_id").notNull().unique(),
  email: text("email"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const userTenants = pgTable("user_tenants", {
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.tenantId] }),
  index("idx_user_tenants_tenant").on(table.tenantId),
])

export const projectSchedules = pgTable("project_schedules", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  tenantId: text("tenant_id")
    .references(() => tenants.id)
    .notNull(),
  name: text("name").notNull(),
  cronPattern: text("cron_pattern").notNull(),
  timeZone: text("time_zone").notNull().default("UTC"),
  targetPath: text("target_path").notNull(),
  method: text("method").notNull().default("POST"),
  body: jsonb("body"),
  headers: jsonb("headers"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("project_schedules_project_id_name_unique").on(table.projectId, table.name),
])

export const scheduleExecutions = pgTable("schedule_executions", {
  id: text("id").primaryKey(),
  scheduleId: text("schedule_id")
    .references(() => projectSchedules.id, { onDelete: "cascade" })
    .notNull(),
  trigger: text("trigger").notNull().default("cron"),
  firedAt: timestamp("fired_at").defaultNow().notNull(),
  statusCode: integer("status_code"),
  latencyMs: bigint("latency_ms", { mode: "number" }),
  error: text("error"),
}, (table) => [
  index("schedule_executions_schedule_id_fired_at_idx").on(table.scheduleId, table.firedAt),
])

export const pods = pgTable("pods", {
  id: text("id").primaryKey(),
  podName: text("pod_name").notNull().unique(),
  status: podStatusEnum("status").notNull().default("warm"),
  projectId: text("project_id").references(() => projects.id),
  podIp: text("pod_ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const globalTimeoutDefaults = pgTable("global_timeout_defaults", {
  id: text("id").primaryKey(),
  defaultTimeoutIdle: bigint("default_timeout_idle", { mode: "number" }).notNull(),
  defaultAppTimeoutIdle: bigint("default_app_timeout_idle", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const globalBudgetDefaults = pgTable("global_budget_defaults", {
  id: text("id").primaryKey(),
  defaultTenantBudget: bigint("default_tenant_budget", { mode: "number" }).notNull(),
  defaultTenantBudgetDuration: text("default_tenant_budget_duration").notNull(),
  defaultProjectBudget: bigint("default_project_budget", { mode: "number" }).notNull(),
  defaultProjectBudgetDuration: text("default_project_budget_duration").notNull(),
  defaultChatBudget: bigint("default_chat_budget", { mode: "number" }).notNull(),
  defaultChatBudgetDuration: text("default_chat_budget_duration").notNull(),
  defaultBackendBudget: bigint("default_backend_budget", { mode: "number" }).notNull(),
  defaultBackendBudgetDuration: text("default_backend_budget_duration").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const globalAgentDefaults = pgTable("global_agent_defaults", {
  id: text("id").primaryKey(),
  defaultModel: text("default_model").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const tenantTimeoutDefaults = pgTable("tenant_timeout_defaults", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  defaultTimeoutIdle: bigint("default_timeout_idle", { mode: "number" }).notNull(),
  defaultAppTimeoutIdle: bigint("default_app_timeout_idle", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const tenantBudgetDefaults = pgTable("tenant_budget_defaults", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  defaultTenantBudget: bigint("default_tenant_budget", { mode: "number" }).notNull(),
  defaultTenantBudgetDuration: text("default_tenant_budget_duration").notNull(),
  defaultProjectBudget: bigint("default_project_budget", { mode: "number" }).notNull(),
  defaultProjectBudgetDuration: text("default_project_budget_duration").notNull(),
  defaultChatBudget: bigint("default_chat_budget", { mode: "number" }).notNull(),
  defaultChatBudgetDuration: text("default_chat_budget_duration").notNull(),
  defaultBackendBudget: bigint("default_backend_budget", { mode: "number" }).notNull(),
  defaultBackendBudgetDuration: text("default_backend_budget_duration").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const tenantAgentDefaults = pgTable("tenant_agent_defaults", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  defaultModel: text("default_model").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
