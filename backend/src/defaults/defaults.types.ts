import type { ModelOption } from "./model-registry"

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

export interface AgentDefaults {
  defaultModel: string
}

export interface AgentDefaultsResponse extends AgentDefaults {
  availableModels: ModelOption[]
}

export type UpdateTimeoutDefaultsDto = Partial<TimeoutDefaults>
export type UpdateBudgetDefaultsDto = Partial<BudgetDefaults>
export type UpdateAgentDefaultsDto = Partial<AgentDefaults>
