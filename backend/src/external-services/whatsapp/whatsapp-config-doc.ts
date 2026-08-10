import type { JsonValue } from '../platform/external-service-definition';

export type WhatsappChannelResource = {
  apiToken: string;
  webhookSecret: string;
  label: string | null;
};

export type WhatsappAllowedChat = {
  chatId: string;
  chatName: string | null;
};

export type WhatsappEnvironmentChannel = {
  channelId: string;
  allowedChats: WhatsappAllowedChat[];
};

export type WhatsappEnvironmentConfig = {
  channels: WhatsappEnvironmentChannel[];
};

type JsonObject = { [key: string]: JsonValue };

function asObject(value: JsonValue | undefined): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
}

function asString(value: JsonValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

export function parseChannelResource(value: JsonValue): WhatsappChannelResource | null {
  const resource = asObject(value);
  const apiToken = resource ? asString(resource.apiToken) : null;
  const webhookSecret = resource ? asString(resource.webhookSecret) : null;
  if (!resource || !apiToken || !webhookSecret) return null;

  return { apiToken, webhookSecret, label: asString(resource.label) };
}

export function parseEnvironmentConfig(value: JsonValue | null): WhatsappEnvironmentConfig {
  const config = asObject(value);
  const channels = config && Array.isArray(config.channels) ? config.channels : [];

  return {
    channels: channels.flatMap((entry) => {
      const channel = asObject(entry);
      const channelId = channel ? asString(channel.channelId) : null;
      if (!channel || !channelId) return [];
      return [{ channelId, allowedChats: parseAllowedChats(channel.allowedChats) }];
    }),
  };
}

export function configReferencesChannel(config: JsonValue, channelId: string): boolean {
  return parseEnvironmentConfig(config).channels.some((channel) => channel.channelId === channelId);
}

function parseAllowedChats(value: JsonValue | undefined): WhatsappAllowedChat[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const chat = asObject(entry);
    const chatId = chat ? asString(chat.chatId) : null;
    if (!chat || !chatId) return [];
    return [{ chatId, chatName: asString(chat.chatName) }];
  });
}
