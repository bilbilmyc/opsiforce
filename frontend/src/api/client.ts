const API_BASE = "/api"

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`API error: ${status}`)
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  }
  if (options?.body) {
    headers["Content-Type"] = "application/json"
  }

  const tenant = localStorage.getItem("tenant")
  if (tenant) {
    headers["x-tenant-name"] = tenant
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    if (res.status === 401) {
      window.location.reload()
      throw new Error("Unauthorized")
    }
    if (res.status === 403 && window.location.pathname !== "/permission-denied") {
      localStorage.removeItem("tenant")
      window.location.href = "/permission-denied"
      throw new Error("Forbidden")
    }
    throw new ApiError(res.status)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : (undefined as T)
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
}

export interface Tenant {
  id: string
  name: string
  displayName: string
}

export type ProjectStatus = "starting" | "active" | "suspended" | "disabled"

export interface Project {
  id: string
  tenantId: string
  workspaceId: string | null
  title: string | null
  description: string | null
  status: ProjectStatus
  bifrostProjectId: string | null
  timeoutIdle: number
  appTimeoutIdle: number
  timezone: string
  authMode: ProjectAuthMode
  lastActiveAt: string | null
  createdAt: string
}

export interface ProjectStatusResponse {
  id: string
  status: ProjectStatus
  workspaceId: string | null
  operation?: ProjectOperation
}

export type ProjectOperationStatus = "queued" | "copying" | "starting" | "failed"

export interface ProjectOperation {
  type: "duplicate"
  status: ProjectOperationStatus
  bytesTotal: number
  bytesCopied: number
  error: string | null
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
}

export type ProjectAuthMode = "public" | "manual" | "makara"

export interface ProjectAuthOidcConfig {
  clientId?: string
  clientSecret?: string
  discoveryUrl?: string
  scope?: string
}

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

export interface Workspace {
  id: string
  tenantId: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  memberCount: number
  projectCount: number
}

export interface WorkspacePreferences {
  workspaceOrder: string[]
  updatedAt: string | null
}

export interface OpenCodeSession {
  id: string
  parentID?: string
  directory: string
  title: string
  time: { created: number; updated: number }
}

export interface User {
  id: string
  keycloakId: string
  email: string | null
  displayName: string | null
  createdAt: string
  updatedAt: string
}

export const userApi = {
  me: () => api.post<User>("/users/me"),
}

export interface Schedule {
  id: string
  projectId: string
  tenantId: string
  name: string
  cronPattern: string
  timeZone: string
  targetPath: string
  method: string
  body: unknown
  headers: unknown
  isActive: boolean
  createdAt: string
  updatedAt: string
  projectTitle?: string | null
}

export interface ScheduleExecution {
  id: string
  scheduleId: string
  trigger: string
  firedAt: string
  statusCode: number | null
  latencyMs: number | null
  error: string | null
}

export interface UpdateScheduleDto {
  cronPattern?: string
  targetPath?: string
  method?: string
  body?: unknown
  headers?: Record<string, string>
  isActive?: boolean
}

export const scheduleApi = {
  list: (projectId?: string) => api.get<Schedule[]>(projectId ? `/schedules?projectId=${projectId}` : "/schedules"),
  listByProject: (projectId: string) => api.get<Schedule[]>(`/projects/${projectId}/schedules`),
  update: (projectId: string, scheduleId: string, dto: UpdateScheduleDto) =>
    api.patch<Schedule>(`/projects/${projectId}/schedules/${scheduleId}`, dto),
  remove: (projectId: string, scheduleId: string) => api.delete<void>(`/projects/${projectId}/schedules/${scheduleId}`),
  triggerRun: (projectId: string, scheduleId: string) =>
    api.post<{ success: boolean }>(`/projects/${projectId}/schedules/${scheduleId}/run`),
  getExecutions: (scheduleId: string, projectId: string, limit = 50) =>
    api.get<ScheduleExecution[]>(`/projects/${projectId}/schedules/${scheduleId}/executions?limit=${limit}`),
}

export interface TimeoutDefaults {
  defaultTimeoutIdle: number
  defaultAppTimeoutIdle: number
}

export interface BudgetDefaults {
  defaultTenantBudget: number
  defaultTenantBudgetDuration: string
  defaultProjectBudget: number
  defaultProjectBudgetDuration: string
  defaultChatBudget: number
  defaultChatBudgetDuration: string
  defaultBackendBudget: number
  defaultBackendBudgetDuration: string
}

export interface ModelOption {
  value: string
  label: string
}

export interface AgentDefaults {
  defaultModel: string
  availableModels: ModelOption[]
}
