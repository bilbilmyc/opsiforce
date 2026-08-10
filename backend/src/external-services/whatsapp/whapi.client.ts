import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { errorMessage } from '../../common/error-message';
import type { WhatsappChatOption } from './whatsapp.types';
import { WHATSAPP_GROUP_CHAT_SUFFIX, WHATSAPP_WEBHOOK_SECRET_HEADER } from './whatsapp.constants';

const REQUEST_TIMEOUT_MS = 15_000;
const MEDIA_TIMEOUT_MS = 60_000;
const PAGE_SIZE = 500;
const MAX_PAGES = 10;

interface WhapiChatPage {
  chats?: Array<{ id?: string; name?: string | null; type?: string }>;
  total?: number;
}

interface WhapiGroupPage {
  groups?: Array<{ id?: string; name?: string | null }>;
  total?: number;
}

interface WhapiSettings {
  webhooks?: Array<{
    url?: string;
    headers?: Record<string, string>;
    events?: Array<{ type?: string; method?: string }>;
  }>;
}

export interface WhapiWebhookRegistration {
  url: string;
  secret: string | null;
  handlesIncomingMessages: boolean;
}

@Injectable()
export class WhapiClient {
  private readonly logger = new Logger(WhapiClient.name);

  constructor(private readonly configService: ConfigService) {}

  async listChats(apiToken: string): Promise<WhatsappChatOption[]> {
    const chats = await this.collectChats(apiToken);
    const groups = await this.collectGroups(apiToken);

    const byChatId = new Map<string, WhatsappChatOption>();
    for (const chat of chats) byChatId.set(chat.chatId, chat);
    for (const group of groups) {
      const existing = byChatId.get(group.chatId);
      byChatId.set(group.chatId, { ...group, name: group.name ?? existing?.name ?? null });
    }

    return [...byChatId.values()].toSorted(
      (a, b) => a.kind.localeCompare(b.kind) || (a.name ?? a.chatId).localeCompare(b.name ?? b.chatId)
    );
  }

  async configureWebhook(apiToken: string, webhookUrl: string, webhookSecret: string): Promise<void> {
    await this.request<object>(apiToken, 'PATCH', '/settings', {
      webhooks: [
        {
          url: webhookUrl,
          mode: 'body',
          headers: { [WHATSAPP_WEBHOOK_SECRET_HEADER]: webhookSecret },
          events: [{ type: 'messages', method: 'post' }],
        },
      ],
    });
    this.logger.log(`Configured Whapi webhook at ${webhookUrl}`);
  }

  async listWebhooks(apiToken: string): Promise<WhapiWebhookRegistration[]> {
    const settings = await this.request<WhapiSettings>(apiToken, 'GET', '/settings');

    return (settings.webhooks ?? []).flatMap((webhook) => {
      if (!webhook.url) return [];
      const headers = webhook.headers ?? {};
      const secretKey = Object.keys(headers).find(
        (key) => key.toLowerCase() === WHATSAPP_WEBHOOK_SECRET_HEADER.toLowerCase()
      );

      return [
        {
          url: webhook.url,
          secret: secretKey ? headers[secretKey] : null,
          handlesIncomingMessages: (webhook.events ?? []).some(
            (event) => event.type === 'messages' && event.method === 'post'
          ),
        },
      ];
    });
  }

  async fetchMedia(apiToken: string, mediaId: string): Promise<Buffer> {
    const url = `${this.baseUrl()}/media/${encodeURIComponent(mediaId)}`;
    const response = await this.send(url, 'GET', apiToken, undefined, MEDIA_TIMEOUT_MS);

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new BadGatewayException(`Whapi GET /media/${mediaId} failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async fetchMediaLink(link: string): Promise<Buffer> {
    if (!/^https:\/\/\S+$/.test(link)) {
      throw new BadGatewayException(`Refusing to fetch Whapi media from non-https link ${link.slice(0, 120)}`);
    }

    let response: Response;
    try {
      response = await fetch(link, { signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS) });
    } catch (err) {
      throw new BadGatewayException(`Whapi media link is unreachable: ${errorMessage(err)}`);
    }

    if (!response.ok) {
      throw new BadGatewayException(`Whapi media link returned ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private async collectChats(apiToken: string): Promise<WhatsappChatOption[]> {
    const collected: WhatsappChatOption[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const body = await this.request<WhapiChatPage>(
        apiToken,
        'GET',
        `/chats?count=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
      );
      const chats = body.chats ?? [];

      for (const chat of chats) {
        if (!chat.id) continue;
        collected.push({ chatId: chat.id, name: chat.name ?? null, kind: chatKind(chat.id) });
      }

      if (chats.length < PAGE_SIZE) break;
    }

    return collected;
  }

  private async collectGroups(apiToken: string): Promise<WhatsappChatOption[]> {
    const collected: WhatsappChatOption[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const body = await this.request<WhapiGroupPage>(
        apiToken,
        'GET',
        `/groups?count=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
      );
      const groups = body.groups ?? [];

      for (const group of groups) {
        if (!group.id) continue;
        collected.push({ chatId: group.id, name: group.name ?? null, kind: 'group' });
      }

      if (groups.length < PAGE_SIZE) break;
    }

    return collected;
  }

  private async request<T>(apiToken: string, method: string, path: string, body?: object): Promise<T> {
    const url = `${this.baseUrl()}${path}`;

    const response = await this.send(url, method, apiToken, body);

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new BadGatewayException(`Whapi ${method} ${path} failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    return (await response.json()) as T;
  }

  private async send(
    url: string,
    method: string,
    apiToken: string,
    body?: object,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<Response> {
    try {
      return await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new BadGatewayException(`Whapi ${method} ${url} is unreachable: ${errorMessage(err)}`);
    }
  }

  private baseUrl(): string {
    return this.configService.get<string>('whapiApiUrl', '').replace(/\/+$/, '');
  }
}

function chatKind(chatId: string): 'individual' | 'group' {
  return chatId.endsWith(WHATSAPP_GROUP_CHAT_SUFFIX) ? 'group' : 'individual';
}
