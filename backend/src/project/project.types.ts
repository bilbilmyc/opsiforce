import { projectSettings, projects } from "../../db/schema"

export const ProjectStatus = {
  Starting: "starting",
  Active: "active",
  Suspended: "suspended",
  Disabled: "disabled",
} as const

export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus]

export interface CreateProjectDto {
  title?: string
  description?: string
}

export interface UpdateProjectDto {
  title?: string
  description?: string
  timeoutIdle?: number
  appTimeoutIdle?: number
}

export interface DuplicateProjectDto {
  title?: string
}

type ProjectRow = typeof projects.$inferSelect
type ProjectSettingsRow = typeof projectSettings.$inferSelect

export interface ProjectResponse extends ProjectRow {
  timeoutIdle: ProjectSettingsRow["timeoutIdle"]
  appTimeoutIdle: ProjectSettingsRow["appTimeoutIdle"]
}
