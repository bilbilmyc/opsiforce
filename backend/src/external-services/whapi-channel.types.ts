export interface WhapiOrganization {
  tenantId: string;
  tenantName: string;
  tenantDisplayName: string;
}

export interface WhapiChannelResponse {
  id: string;
  channelId: string;
  tenantId: string;
  tenantName: string;
  tenantDisplayName: string;
  label: string | null;
  apiTokenPreview: string;
  webhookSecret: string;
  webhookUrl: string;
  routeCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WhapiChatRouteResponse {
  id: string;
  chatId: string;
  chatName: string | null;
  projectEnvironmentId: string;
  projectId: string;
  projectTitle: string | null;
  environmentName: string;
  createdAt: Date;
}

export interface WhapiRoutableEnvironment {
  projectEnvironmentId: string;
  projectId: string;
  projectTitle: string | null;
  environmentName: string;
  isDefault: boolean;
}

export interface WhapiIngestChannel {
  id: string;
  channelId: string;
  apiToken: string;
  webhookSecret: string;
}

export interface WhapiChatOption {
  chatId: string;
  name: string | null;
  kind: 'individual' | 'group';
}

export interface CreateWhapiChannelDto {
  channelId?: string;
  tenantId?: string;
  apiToken?: string;
  label?: string | null;
}

export interface UpdateWhapiChannelDto {
  apiToken?: string;
  label?: string | null;
}

export interface CreateWhapiChatRouteDto {
  chatId?: string;
  chatName?: string | null;
  projectEnvironmentId?: string;
}

export interface ConfigureWhapiWebhookDto {
  webhookUrl?: string;
}

export interface ConfigureWhapiWebhookResult {
  webhookUrl: string;
  secretHeader: string;
}
