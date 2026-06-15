export const MAKARA_AUTH_SYNC_QUEUE = 'makara-auth-sync';

export interface TenantSettingsResponse {
  makaraTenantName: string | null;
}

export interface UpdateTenantSettingsDto {
  makaraTenantName: string;
}

export interface MakaraAuthSyncJobData {
  projectId: string;
  makaraTenantName: string;
}
