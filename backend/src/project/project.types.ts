export interface CreateProjectDto {
  title?: string
  description?: string
}

export interface UpdateProjectDto {
  title?: string
  description?: string
}

export interface ProjectResponse {
  id: string
  title: string | null
  description: string | null
  directory: string
  status: "pending" | "starting" | "active" | "suspended" | "stopped"
  podName: string | null
  podIp: string | null
  sessionId: string | null
  platformVersion: string
  lastActiveAt: Date | null
  createdAt: Date
  updatedAt: Date
}
