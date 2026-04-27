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
  timezone?: string
}

export interface UpdateProjectDto {
  title?: string
  description?: string
  timeoutIdle?: number
  appTimeoutIdle?: number
  timezone?: string
}

export interface DuplicateProjectDto {
  title?: string
}

type ProjectRow = typeof projects.$inferSelect
type ProjectSettingsRow = typeof projectSettings.$inferSelect

export interface ProjectResponse extends ProjectRow {
  timeoutIdle: ProjectSettingsRow["timeoutIdle"]
  appTimeoutIdle: ProjectSettingsRow["appTimeoutIdle"]
  timezone: ProjectSettingsRow["timezone"]
  authMode: ProjectSettingsRow["authMode"]
}

export interface ProjectStatusResponse {
  id: string
  status: ProjectStatus
  workspaceId: string | null
}

export interface ProjectAuthOidcConfig {
  clientId?: string
  clientSecret?: string
  discoveryUrl?: string
  scope?: string
}

export type ProjectAuthMode = "public" | "manual" | "makara"

export interface ProjectAuthResponse {
  mode: ProjectAuthMode
  config?: ProjectAuthOidcConfig
  bypassAuthPaths?: string[]
}

export interface UpdateProjectAuthDto {
  mode: ProjectAuthMode
  config?: ProjectAuthOidcConfig
  bypassAuthPaths?: string[]
}
