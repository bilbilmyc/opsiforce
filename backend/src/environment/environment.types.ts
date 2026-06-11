import { environments } from "../../db/schema"

export const DEVELOPMENT_ENVIRONMENT_NAME = "Development"
export const PRODUCTION_ENVIRONMENT_NAME = "Production"

export type EnvironmentRow = typeof environments.$inferSelect

export interface EnvironmentResponse {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  isProtected: boolean
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
