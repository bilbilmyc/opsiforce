import { projectApps, projectSettings, projects } from "../../db/schema"

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
  agentId?: string
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
type ProjectAppRow = typeof projectApps.$inferSelect

export interface ProjectResponse extends ProjectRow {
  timeoutIdle: ProjectSettingsRow["timeoutIdle"]
  appTimeoutIdle: ProjectSettingsRow["appTimeoutIdle"]
  timezone: ProjectSettingsRow["timezone"]
  authMode: ProjectSettingsRow["authMode"]
  isPinned: boolean
  pinnedAt: ProjectAppRow["pinnedAt"]
  hasApp: boolean
  appName: ProjectAppRow["name"]
  appDescription: ProjectAppRow["description"]
}

export interface ProjectState {
  id: string
  status: ProjectStatus
  workspaceId: string | null
  operation: ProjectDuplicateOperation | null
  app: ProjectAppMeta | null
}

export interface ProjectDuplicateOperation {
  type: "duplicate"
  status: "queued" | "copying" | "starting" | "failed"
  bytesTotal: number
  bytesCopied: number
  error: string | null
  startedAt: Date | null
  completedAt: Date | null
  updatedAt: Date
}

export interface ProjectAppMeta {
  exists: boolean
  name: string | null
  description: string | null
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

export interface SetAppPinDto {
  isPinned: boolean
}

export interface UpdateAppDto {
  name?: string
  description?: string | null
}
