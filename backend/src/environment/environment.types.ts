import { environments } from "../../db/schema"

export const DEVELOPMENT_ENVIRONMENT_NAME = "Development"

export type EnvironmentRow = typeof environments.$inferSelect

export interface EnvironmentResponse {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CreateEnvironmentDto {
  name?: string
  description?: string | null
}

export interface UpdateEnvironmentDto {
  name?: string
  description?: string | null
}
