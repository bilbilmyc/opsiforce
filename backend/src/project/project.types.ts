import { projects } from "../../db/schema"

export const ProjectStatus = {
  Pending: "pending",
  Active: "active",
  Suspended: "suspended",
} as const

export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus]

export interface CreateProjectDto {
  title?: string
  description?: string
}

export interface UpdateProjectDto {
  title?: string
  description?: string
}

export type ProjectResponse = typeof projects.$inferSelect
