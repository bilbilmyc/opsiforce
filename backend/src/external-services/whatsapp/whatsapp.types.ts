export type WhatsappChannelResponse = {
  channelId: string;
  label: string | null;
  apiTokenPreview: string;
  webhookUrl: string;
  referencedEnvironmentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WhatsappAvailableChannelResponse = {
  channelId: string;
  label: string | null;
};

export type WhatsappEnvironmentChannelResponse = {
  channelId: string;
  label: string | null;
  registered: boolean;
  allowedChats: Array<{ chatId: string; chatName: string | null }>;
};

export type WhatsappChatOption = {
  chatId: string;
  name: string | null;
  kind: 'individual' | 'group';
};

export type CreateWhatsappChannelDto = {
  channelId?: string;
  apiToken?: string;
  label?: string | null;
};

export type UpdateWhatsappChannelDto = {
  apiToken?: string;
  label?: string | null;
};

export type AllowlistWhatsappChatDto = {
  chatId?: string;
  chatName?: string | null;
};

export type ConfigureWhatsappWebhookResult = {
  webhookUrl: string;
  secretHeader: string;
};

export type WhatsappWebhookState = 'in-sync' | 'stale-url' | 'stale-secret' | 'missing-event' | 'not-configured';

export type WhatsappWebhookStatusResponse = {
  state: WhatsappWebhookState;
  configuredUrl: string | null;
  expectedUrl: string;
};
