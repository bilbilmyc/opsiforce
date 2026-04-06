export interface BifrostProviderConfig {
  provider: string
  weight?: number
  allowed_models?: string[]
}

export interface CreateVirtualKeyRequest {
  name: string
  description?: string
  provider_configs?: BifrostProviderConfig[]
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

export interface ProjectUsageResponse {
  projectId: string
  totalRequests: number
  totalTokens: number
  totalCost: number
  averageLatency: number
  successRate: number
}

export interface TenantUsageResponse {
  tenantId: string
  totalRequests: number
  totalTokens: number
  totalCost: number
  projects: ProjectUsageResponse[]
}
