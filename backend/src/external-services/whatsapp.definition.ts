import { Injectable, Logger } from '@nestjs/common';
import { errorMessage } from '../common/error-message';
import type {
  ExternalServiceDefinition,
  ExternalServiceRow,
  JsonValue,
  PublishCarryContext,
  WebhookRequest,
  WebhookVerification,
} from './external-service-definition';
import { timingSafeStringEqual } from './timing-safe-equal';
import { WhapiChannelService } from './whapi-channel.service';
import type { WhapiIngestChannel } from './whapi-channel.types';
import { WhapiClient } from './whapi.client';
import { WHAPI_SERVICE_NAME, WHAPI_WEBHOOK_SECRET_HEADER } from './whapi.constants';

type JsonObject = { [key: string]: JsonValue };

interface WhatsappMessage {
  id: string;
  chatId: string;
  fromMe: boolean;
  payload: JsonObject;
}

interface WhatsappMedia {
  id: string;
  contentType: string | null;
  filename: string | null;
  sizeBytes: number | null;
  caption: string | null;
  link: string | null;
}

const WHATSAPP_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS whatsapp_messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     received_at TEXT NOT NULL,
     raw_payload TEXT NOT NULL,
     app_delivered_at TEXT,
     provider_message_id TEXT NOT NULL,
     channel_id TEXT NOT NULL,
     chat_id TEXT NOT NULL,
     chat_name TEXT,
     from_me INTEGER NOT NULL,
     from_number TEXT,
     from_name TEXT,
     type TEXT NOT NULL,
     sent_at TEXT,
     source TEXT,
     text_body TEXT,
     caption TEXT,
     media_id TEXT,
     media_filename TEXT,
     media_content_type TEXT,
     media_size_bytes INTEGER,
     media_content BLOB
   );
   CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_provider_message_id
     ON whatsapp_messages (provider_message_id);
   CREATE INDEX IF NOT EXISTS whatsapp_messages_chat_id
     ON whatsapp_messages (chat_id);`,
] as const;

@Injectable()
export class WhatsappDefinition implements ExternalServiceDefinition {
  readonly serviceName = WHAPI_SERVICE_NAME;
  readonly messageTable = 'whatsapp_messages';
  readonly attachmentTable = null;
  readonly attachmentParentColumn = null;
  readonly callbackPath = `/api/external-services/${WHAPI_SERVICE_NAME}`;
  readonly migrations = WHATSAPP_MIGRATIONS;
  readonly unroutableResponse = 'accept' as const;

  private readonly logger = new Logger(WhatsappDefinition.name);
  private readonly channelsByRequest = new WeakMap<WebhookRequest, Promise<WhapiIngestChannel[]>>();

  constructor(
    private readonly whapiChannelService: WhapiChannelService,
    private readonly whapiClient: WhapiClient
  ) {}

  async verify(request: WebhookRequest): Promise<WebhookVerification> {
    const channels = await this.matchedChannels(request);
    if (channels.length === 0) {
      return { verified: false, reason: `Unknown channel_id or invalid ${WHAPI_WEBHOOK_SECRET_HEADER}` };
    }
    return { verified: true };
  }

  extractRoutingKeys(request: WebhookRequest): string[] {
    return [...new Set(messagesOf(request).map((message) => message.chatId))];
  }

  async resolveEnvironments(routingKey: string, request: WebhookRequest): Promise<string[]> {
    const channels = await this.matchedChannels(request);
    const projectEnvironmentIds = await this.whapiChannelService.findEnvironmentIdsForChat(
      channels.map((channel) => channel.id),
      routingKey
    );

    if (projectEnvironmentIds.length === 0) {
      this.logger.log(`WhatsApp chat ${routingKey} is not allowlisted, dropping its messages`);
    }

    return projectEnvironmentIds;
  }

  async carryOnPublish(context: PublishCarryContext): Promise<void> {
    const carried = await this.whapiChannelService.copyRoutesToEnvironment(
      context.sourceEnvironmentId,
      context.targetEnvironmentId
    );
    if (carried > 0) {
      this.logger.log(`Carried ${carried} WhatsApp chat route(s) to environment ${context.targetEnvironmentId}`);
    }
  }

  async buildRows(request: WebhookRequest, routingKey: string): Promise<ExternalServiceRow[]> {
    const channels = await this.matchedChannels(request);
    const channelId = channelIdOf(request) ?? '';
    const rows: ExternalServiceRow[] = [];

    for (const message of messagesOf(request)) {
      if (message.chatId !== routingKey) continue;
      rows.push(await this.buildRow(message, channelId, channels[0]?.apiToken ?? null));
    }

    return rows;
  }

  private async buildRow(
    message: WhatsappMessage,
    channelId: string,
    apiToken: string | null
  ): Promise<ExternalServiceRow> {
    const { payload } = message;
    const type = asString(payload.type) ?? 'unknown';
    const media = mediaOf(payload, type);
    const content = media ? await this.fetchMediaContent(media, apiToken) : null;

    return {
      providerMessageId: message.id,
      rawPayload: JSON.stringify(payload),
      columns: {
        provider_message_id: message.id,
        channel_id: channelId,
        chat_id: message.chatId,
        chat_name: asString(payload.chat_name),
        from_me: message.fromMe ? 1 : 0,
        from_number: asString(payload.from),
        from_name: asString(payload.from_name),
        type,
        sent_at: sentAtOf(payload),
        source: asString(payload.source),
        text_body: textBodyOf(payload),
        caption: media?.caption ?? null,
        media_id: media?.id ?? null,
        media_filename: media?.filename ?? null,
        media_content_type: media?.contentType ?? null,
        media_size_bytes: content?.byteLength ?? media?.sizeBytes ?? null,
        media_content: content,
      },
      attachments: [],
    };
  }

  private async fetchMediaContent(media: WhatsappMedia, apiToken: string | null): Promise<Buffer | null> {
    const failures: string[] = [];

    if (apiToken) {
      try {
        return await this.whapiClient.fetchMedia(apiToken, media.id);
      } catch (err) {
        failures.push(errorMessage(err));
      }
    }

    if (media.link) {
      try {
        return await this.whapiClient.fetchMediaLink(media.link);
      } catch (err) {
        failures.push(errorMessage(err));
      }
    }

    this.logger.error(
      `Could not fetch WhatsApp media ${media.id}; the message is stored with media_content NULL: ${failures.join('; ') || 'no channel token and no auto_download link'}`
    );
    return null;
  }

  private matchedChannels(request: WebhookRequest): Promise<WhapiIngestChannel[]> {
    const cached = this.channelsByRequest.get(request);
    if (cached) return cached;

    const pending = this.resolveMatchedChannels(request);
    this.channelsByRequest.set(request, pending);
    return pending;
  }

  private async resolveMatchedChannels(request: WebhookRequest): Promise<WhapiIngestChannel[]> {
    const channelId = channelIdOf(request);
    const secret = request.headers[WHAPI_WEBHOOK_SECRET_HEADER.toLowerCase()] ?? '';
    if (!channelId || !secret) return [];

    const channels = await this.whapiChannelService.findChannelsByChannelId(channelId);
    return channels.filter((channel) => timingSafeStringEqual(channel.webhookSecret, secret));
  }
}

function channelIdOf(request: WebhookRequest): string | null {
  const body = asObject(request.json);
  return body ? asString(body.channel_id) : null;
}

function messagesOf(request: WebhookRequest): WhatsappMessage[] {
  const body = asObject(request.json);
  const messages = body ? body.messages : null;
  if (!Array.isArray(messages)) return [];

  const collected: WhatsappMessage[] = [];
  for (const entry of messages) {
    const payload = asObject(entry);
    if (!payload) continue;

    const id = asString(payload.id);
    const chatId = asString(payload.chat_id);
    if (!id || !chatId) continue;

    collected.push({ id, chatId, fromMe: payload.from_me === true, payload });
  }

  return collected;
}

function mediaOf(payload: JsonObject, type: string): WhatsappMedia | null {
  const media = asObject(payload[type]);
  const id = media ? asString(media.id) : null;
  if (!media || !id) return null;

  return {
    id,
    contentType: asString(media.mime_type),
    filename: asString(media.filename),
    sizeBytes: asNumber(media.file_size),
    caption: asString(media.caption),
    link: asString(media.link),
  };
}

function textBodyOf(payload: JsonObject): string | null {
  const text = asObject(payload.text);
  return text ? asString(text.body) : null;
}

function sentAtOf(payload: JsonObject): string | null {
  const timestamp = asNumber(payload.timestamp);
  return timestamp === null ? null : new Date(timestamp * 1000).toISOString();
}

function asObject(value: JsonValue | undefined): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
}

function asString(value: JsonValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
