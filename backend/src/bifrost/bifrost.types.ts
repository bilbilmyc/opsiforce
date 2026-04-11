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
  budget?: BifrostBudget
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
  budget?: BifrostBudget
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

export interface BifrostLogStats {
  total_requests: number
  total_tokens: number
  total_cost: number
  average_latency: number
  success_rate: number
}

export interface BifrostCostBucket {
  timestamp: string
  total_cost: number
  by_model: Record<string, number>
}

export interface BifrostCostHistogram {
  buckets: BifrostCostBucket[]
  bucket_size_seconds: number
  models: string[]
}

export interface KeyTypeUsage {
  keyType: KeyType
  totalRequests: number
  totalTokens: number
  totalCost: number
  averageLatency: number
  successRate: number
}

export interface ProjectUsageResponse {
  projectId: string
  totalRequests: number
  totalTokens: number
  totalCost: number
  averageLatency: number
  successRate: number
  byKeyType?: KeyTypeUsage[]
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

export interface TenantUsageResponse {
  tenantId: string
  totalRequests: number
  totalTokens: number
  totalCost: number
  projects: ProjectUsageResponse[]
  byKeyType?: KeyTypeUsage[]
}
