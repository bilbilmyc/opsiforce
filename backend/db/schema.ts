import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core"

export const projectStatusEnum = pgEnum("project_status", [
  "pending",
  "starting",
  "active",
  "suspended",
  "stopped",
])

export const podStatusEnum = pgEnum("pod_status", [
  "warm",
  "assigned",
  "terminating",
])

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
  status: projectStatusEnum("status").notNull().default("pending"),
  podName: text("pod_name"),
  podIp: text("pod_ip"),
  sessionId: text("session_id"),
  platformVersion: text("platform_version").notNull(),
  lastActiveAt: timestamp("last_active_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const projectApiKeys = pgTable("project_api_keys", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  tenantId: text("tenant_id")
    .references(() => tenants.id)
    .notNull(),
  bifrostKeyId: text("bifrost_key_id").notNull(),
  bifrostKeyToken: text("bifrost_key_token").notNull(),
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
