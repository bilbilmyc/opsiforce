export const TENANT_MAKARA_REAPPLY_QUEUE = "tenant-makara-reapply"

export interface TenantSettingsResponse {
  makaraTenantName: string | null
}

export interface UpdateTenantSettingsDto {
  makaraTenantName: string
}

export interface MakaraReapplyJobData {
  projectId: string
  makaraTenantName: string
}
