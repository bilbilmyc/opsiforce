export interface TenantConfigResponse {
  privateWorkspaceEnabled: boolean;
}

export interface UpdateTenantConfigDto {
  privateWorkspaceEnabled?: boolean;
}
