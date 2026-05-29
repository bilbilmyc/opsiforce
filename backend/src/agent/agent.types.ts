import { agents } from "../../db/schema"

export type AgentRow = typeof agents.$inferSelect

export interface AgentResponse {
  id: string
  name: string
  displayName: string | null
  description: string | null
}

export const DEFAULT_AGENT_NAME = "app-builder"
