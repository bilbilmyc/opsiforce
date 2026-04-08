import { pgTable, text, timestamp, pgEnum, real, integer, bigint } from "drizzle-orm/pg-core"

export const projectStatusEnum = pgEnum("project_status", [
  "starting",
  "active",
  "suspended",
])

export const podStatusEnum = pgEnum("pod_status", [
  "warm",
  "assigned",
  "terminating",
])

export const keyTypeEnum = pgEnum("key_type", ["chat", "backend"])

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

const tenantIdField = text("tenant_id")
  .references(() => tenants.id)
  .notNull()

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  tenantId: tenantIdField,
  title: text("title"),
  description: text("description"),
  directory: text("directory").notNull(),
  status: projectStatusEnum("status").notNull().default("starting"),
  podName: text("pod_name"),
  podIp: text("pod_ip"),
  sessionId: text("session_id"),
  platformVersion: text("platform_version").notNull(),
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
})

export const projectApiKeys = pgTable("project_api_keys", {
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
  maxBudget: real("max_budget"),
  budgetDuration: text("budget_duration"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const pods = pgTable("pods", {
  id: text("id").primaryKey(),
  podName: text("pod_name").notNull().unique(),
  status: podStatusEnum("status").notNull().default("warm"),
  projectId: text("project_id").references(() => projects.id),
  podIp: text("pod_ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
