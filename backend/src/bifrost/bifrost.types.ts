export type KeyType = "chat" | "backend"

export interface BifrostProviderConfig {
  provider: string
  weight?: number | null
  allowed_models?: string[]
  key_ids?: string[]
}

export interface BifrostBudget {
  max_limit: number
  reset_duration: string
  current_usage?: number
}

export interface CreateVirtualKeyRequest {
  name: string
  description?: string
  provider_configs?: BifrostProviderConfig[]
  budgets?: BifrostBudget[]
  team_id?: string
  is_active?: boolean
}

export interface BifrostVirtualKey {
  id: string
  name: string
  value: string
  description: string
  is_active: boolean
  provider_configs: BifrostProviderConfig[]
}

export interface CreateVirtualKeyResponse {
  message: string
  virtual_key: BifrostVirtualKey
}

export interface DeleteVirtualKeyResponse {
  message: string
}

export interface CreateCustomerRequest {
  name: string
  budget?: BifrostBudget
}

export interface BifrostCustomer {
  id: string
  name: string
}

export interface CreateCustomerResponse {
  message: string
  customer: BifrostCustomer
}

export interface CreateTeamRequest {
  name: string
  customer_id?: string
  budgets?: BifrostBudget[]
}

export interface BifrostTeam {
  id: string
  name: string
  customer_id?: string
}

export interface CreateTeamResponse {
  message: string
  team: BifrostTeam
}

export interface ProjectBudgetEntry {
  keyType: KeyType
  maxBudget: number | null
  budgetDuration: string | null
  currentUsage: number
}

export interface UpdateBudgetRequest {
  keyType: KeyType
  maxBudget: number
  budgetDuration: string
}

export interface ProjectBudgetResponse {
  maxBudget: number | null
  budgetDuration: string | null
  currentUsage: number
}

export interface TenantBudgetResponse {
  tenantBudget: number | null
  budgetDuration: string | null
  currentUsage: number
}

export interface UpdateTenantBudgetRequest {
  tenantBudget: number
  budgetDuration: string
}

export interface UpdateProjectBudgetRequest {
  maxBudget: number
  budgetDuration: string
}
