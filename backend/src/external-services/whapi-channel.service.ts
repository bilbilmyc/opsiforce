import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../../db';
import { environments, projectEnvironments, projects, tenants, whapiChannels, whapiChatRoutes } from '../../db/schema';
import { environmentLabel } from './environment-label';
import { WhapiClient } from './whapi.client';
import type {
  ConfigureWhapiWebhookDto,
  ConfigureWhapiWebhookResult,
  CreateWhapiChannelDto,
  CreateWhapiChatRouteDto,
  UpdateWhapiChannelDto,
  WhapiChannelResponse,
  WhapiChatOption,
  WhapiChatRouteResponse,
  WhapiIngestChannel,
  WhapiOrganization,
  WhapiRoutableEnvironment,
} from './whapi-channel.types';
import { WHAPI_WEBHOOK_PATH, WHAPI_WEBHOOK_SECRET_HEADER } from './whapi.constants';

const CHANNEL_ID_MAX_LENGTH = 120;
const RECORD_ID_MAX_LENGTH = 120;
const LABEL_MAX_LENGTH = 120;
const CHAT_ID_MAX_LENGTH = 200;
const CHAT_NAME_MAX_LENGTH = 200;
const API_TOKEN_MAX_LENGTH = 500;
const WEBHOOK_SECRET_BYTES = 32;
const TOKEN_PREVIEW_LENGTH = 4;

const CHAT_ID_PATTERN = /^[^\s@]+@[^\s@]+$/;

type ChannelRow = typeof whapiChannels.$inferSelect;

@Injectable()
export class WhapiChannelService {
  private readonly logger = new Logger(WhapiChannelService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly whapiClient: WhapiClient
  ) {}

  async listOrganizations(): Promise<WhapiOrganization[]> {
    const rows = await db
      .select({ tenantId: tenants.id, tenantName: tenants.name, tenantDisplayName: tenants.displayName })
      .from(tenants);

    return rows.toSorted((a, b) => a.tenantDisplayName.localeCompare(b.tenantDisplayName));
  }

  async listChannels(): Promise<WhapiChannelResponse[]> {
    const rows = await db
      .select({
        channel: whapiChannels,
        tenantName: tenants.name,
        tenantDisplayName: tenants.displayName,
      })
      .from(whapiChannels)
      .innerJoin(tenants, eq(tenants.id, whapiChannels.tenantId));

    const routeCounts = await db
      .select({ whapiChannelId: whapiChatRoutes.whapiChannelId, routeCount: count() })
      .from(whapiChatRoutes)
      .groupBy(whapiChatRoutes.whapiChannelId);

    const countByChannel = new Map(routeCounts.map((row) => [row.whapiChannelId, Number(row.routeCount)]));

    return rows
      .map((row) =>
        this.toChannelResponse(row.channel, {
          tenantName: row.tenantName,
          tenantDisplayName: row.tenantDisplayName,
          routeCount: countByChannel.get(row.channel.id) ?? 0,
        })
      )
      .toSorted(
        (a, b) => a.tenantDisplayName.localeCompare(b.tenantDisplayName) || a.channelId.localeCompare(b.channelId)
      );
  }

  async createChannel(dto: CreateWhapiChannelDto): Promise<WhapiChannelResponse> {
    const channelId = requireText(dto.channelId, 'channelId', CHANNEL_ID_MAX_LENGTH);
    const tenantId = requireText(dto.tenantId, 'tenantId', RECORD_ID_MAX_LENGTH);
    const apiToken = requireText(dto.apiToken, 'apiToken', API_TOKEN_MAX_LENGTH);
    const label = optionalText(dto.label, 'label', LABEL_MAX_LENGTH);

    const organization = await this.findOrganization(tenantId);

    const [created] = await db
      .insert(whapiChannels)
      .values({
        id: crypto.randomUUID(),
        channelId,
        tenantId,
        apiToken,
        webhookSecret: generateWebhookSecret(),
        label,
      })
      .onConflictDoNothing()
      .returning();

    if (!created) {
      throw new ConflictException(`Channel ${channelId} is already registered for ${organization.tenantDisplayName}`);
    }

    this.logger.log(`Registered Whapi channel ${channelId} for organization ${organization.tenantName}`);

    return this.toChannelResponse(created, { ...organization, routeCount: 0 });
  }

  async updateChannel(id: string, dto: UpdateWhapiChannelDto): Promise<WhapiChannelResponse> {
    const existing = await this.findChannel(id);

    const apiToken =
      dto.apiToken === undefined ? undefined : requireText(dto.apiToken, 'apiToken', API_TOKEN_MAX_LENGTH);
    const label = dto.label === undefined ? undefined : optionalText(dto.label, 'label', LABEL_MAX_LENGTH);

    const [updated] = await db
      .update(whapiChannels)
      .set({
        ...(apiToken === undefined ? {} : { apiToken }),
        ...(label === undefined ? {} : { label }),
        updatedAt: new Date(),
      })
      .where(eq(whapiChannels.id, id))
      .returning();

    if (!updated) throw new NotFoundException('Channel not found');

    return this.toChannelResponse(updated, {
      ...(await this.findOrganization(existing.tenantId)),
      routeCount: await this.countRoutes(id),
    });
  }

  async deleteChannel(id: string): Promise<void> {
    const [deleted] = await db.delete(whapiChannels).where(eq(whapiChannels.id, id)).returning({
      channelId: whapiChannels.channelId,
    });

    if (!deleted) throw new NotFoundException('Channel not found');

    this.logger.log(`Deleted Whapi channel ${deleted.channelId} and its chat routes`);
  }

  async listRoutes(channelId: string): Promise<WhapiChatRouteResponse[]> {
    await this.findChannel(channelId);

    const rows = await db
      .select({
        id: whapiChatRoutes.id,
        chatId: whapiChatRoutes.chatId,
        chatName: whapiChatRoutes.chatName,
        projectEnvironmentId: whapiChatRoutes.projectEnvironmentId,
        projectId: projects.id,
        projectTitle: projects.title,
        environmentName: environments.name,
        isDefault: projectEnvironments.isDefault,
        createdAt: whapiChatRoutes.createdAt,
      })
      .from(whapiChatRoutes)
      .innerJoin(projectEnvironments, eq(projectEnvironments.id, whapiChatRoutes.projectEnvironmentId))
      .innerJoin(projects, eq(projects.id, projectEnvironments.projectId))
      .leftJoin(environments, eq(environments.id, projectEnvironments.environmentId))
      .where(eq(whapiChatRoutes.whapiChannelId, channelId));

    return rows
      .map((row) => ({
        id: row.id,
        chatId: row.chatId,
        chatName: row.chatName,
        projectEnvironmentId: row.projectEnvironmentId,
        projectId: row.projectId,
        projectTitle: row.projectTitle,
        environmentName: environmentLabel(row.environmentName, row.isDefault),
        createdAt: row.createdAt,
      }))
      .toSorted(
        (a, b) =>
          (a.chatName ?? a.chatId).localeCompare(b.chatName ?? b.chatId) ||
          (a.projectTitle ?? '').localeCompare(b.projectTitle ?? '') ||
          a.environmentName.localeCompare(b.environmentName)
      );
  }

  async createRoute(channelId: string, dto: CreateWhapiChatRouteDto): Promise<WhapiChatRouteResponse> {
    const channel = await this.findChannel(channelId);
    const chatId = requireChatId(dto.chatId);
    const chatName = optionalText(dto.chatName, 'chatName', CHAT_NAME_MAX_LENGTH);
    const projectEnvironmentId = requireText(dto.projectEnvironmentId, 'projectEnvironmentId', RECORD_ID_MAX_LENGTH);

    await this.requireEnvironmentInTenant(projectEnvironmentId, channel.tenantId);

    const [created] = await db
      .insert(whapiChatRoutes)
      .values({
        id: crypto.randomUUID(),
        whapiChannelId: channelId,
        chatId,
        projectEnvironmentId,
        chatName,
      })
      .onConflictDoNothing()
      .returning({ id: whapiChatRoutes.id });

    if (!created) {
      throw new ConflictException('That chat is already routed to this environment');
    }

    this.logger.log(
      `Allowlisted chat ${chatId} on channel ${channel.channelId} for environment ${projectEnvironmentId}`
    );

    const routes = await this.listRoutes(channelId);
    const route = routes.find((candidate) => candidate.id === created.id);
    if (!route) throw new NotFoundException('Route not found');
    return route;
  }

  async deleteRoute(channelId: string, routeId: string): Promise<void> {
    const [deleted] = await db
      .delete(whapiChatRoutes)
      .where(and(eq(whapiChatRoutes.id, routeId), eq(whapiChatRoutes.whapiChannelId, channelId)))
      .returning({ chatId: whapiChatRoutes.chatId });

    if (!deleted) throw new NotFoundException('Route not found');
  }

  async copyRoutesToEnvironment(sourceEnvironmentId: string, targetEnvironmentId: string): Promise<number> {
    const routes = await db
      .select({
        whapiChannelId: whapiChatRoutes.whapiChannelId,
        chatId: whapiChatRoutes.chatId,
        chatName: whapiChatRoutes.chatName,
      })
      .from(whapiChatRoutes)
      .where(eq(whapiChatRoutes.projectEnvironmentId, sourceEnvironmentId));

    if (routes.length === 0) return 0;

    const carried = await db
      .insert(whapiChatRoutes)
      .values(
        routes.map((route) => ({
          id: crypto.randomUUID(),
          whapiChannelId: route.whapiChannelId,
          chatId: route.chatId,
          projectEnvironmentId: targetEnvironmentId,
          chatName: route.chatName,
        }))
      )
      .onConflictDoUpdate({
        target: [whapiChatRoutes.whapiChannelId, whapiChatRoutes.chatId, whapiChatRoutes.projectEnvironmentId],
        set: { chatName: sql`excluded.chat_name`, updatedAt: new Date() },
      })
      .returning({ id: whapiChatRoutes.id });

    return carried.length;
  }

  async listRoutableEnvironments(channelId: string): Promise<WhapiRoutableEnvironment[]> {
    const channel = await this.findChannel(channelId);

    const rows = await db
      .select({
        projectEnvironmentId: projectEnvironments.id,
        projectId: projects.id,
        projectTitle: projects.title,
        environmentName: environments.name,
        isDefault: projectEnvironments.isDefault,
      })
      .from(projectEnvironments)
      .innerJoin(projects, eq(projects.id, projectEnvironments.projectId))
      .leftJoin(environments, eq(environments.id, projectEnvironments.environmentId))
      .where(eq(projects.tenantId, channel.tenantId));

    return rows
      .map((row) => ({
        projectEnvironmentId: row.projectEnvironmentId,
        projectId: row.projectId,
        projectTitle: row.projectTitle,
        environmentName: environmentLabel(row.environmentName, row.isDefault),
        isDefault: row.isDefault,
      }))
      .toSorted(
        (a, b) =>
          (a.projectTitle ?? '').localeCompare(b.projectTitle ?? '') ||
          Number(b.isDefault) - Number(a.isDefault) ||
          a.environmentName.localeCompare(b.environmentName)
      );
  }

  async listChats(channelId: string): Promise<WhapiChatOption[]> {
    const channel = await this.findChannel(channelId);
    return this.whapiClient.listChats(channel.apiToken);
  }

  async findChannelsByChannelId(channelId: string): Promise<WhapiIngestChannel[]> {
    return db
      .select({
        id: whapiChannels.id,
        channelId: whapiChannels.channelId,
        apiToken: whapiChannels.apiToken,
        webhookSecret: whapiChannels.webhookSecret,
      })
      .from(whapiChannels)
      .where(eq(whapiChannels.channelId, channelId));
  }

  async findEnvironmentIdsForChat(whapiChannelIds: string[], chatId: string): Promise<string[]> {
    if (whapiChannelIds.length === 0) return [];

    const rows = await db
      .select({ projectEnvironmentId: whapiChatRoutes.projectEnvironmentId })
      .from(whapiChatRoutes)
      .where(and(inArray(whapiChatRoutes.whapiChannelId, whapiChannelIds), eq(whapiChatRoutes.chatId, chatId)));

    return [...new Set(rows.map((row) => row.projectEnvironmentId))];
  }

  async configureWebhook(channelId: string, dto: ConfigureWhapiWebhookDto): Promise<ConfigureWhapiWebhookResult> {
    const channel = await this.findChannel(channelId);
    const webhookUrl = this.resolveWebhookUrl(dto.webhookUrl);

    await this.whapiClient.configureWebhook(channel.apiToken, webhookUrl, channel.webhookSecret);

    return { webhookUrl, secretHeader: WHAPI_WEBHOOK_SECRET_HEADER };
  }

  private resolveWebhookUrl(requested: string | undefined): string {
    const url = (requested ?? this.defaultWebhookUrl()).trim();
    if (!url) {
      throw new ServiceUnavailableException(
        'No webhook URL: set EXTERNAL_SERVICES_WEBHOOK_BASE_URL or pass one explicitly'
      );
    }
    if (!/^https?:\/\/\S+$/.test(url)) {
      throw new BadRequestException(`Invalid webhook URL "${url}", expected an http(s) URL`);
    }
    return url;
  }

  private defaultWebhookUrl(): string {
    const base = this.configService.get<string>('externalServicesWebhookBaseUrl', '').trim().replace(/\/+$/, '');
    return base ? `${base}${WHAPI_WEBHOOK_PATH}` : '';
  }

  private async findChannel(id: string): Promise<ChannelRow> {
    const [channel] = await db.select().from(whapiChannels).where(eq(whapiChannels.id, id));
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  private async findOrganization(tenantId: string): Promise<Omit<WhapiOrganization, 'tenantId'>> {
    const [organization] = await db
      .select({ tenantName: tenants.name, tenantDisplayName: tenants.displayName })
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (!organization) throw new BadRequestException(`Unknown organization ${tenantId}`);
    return organization;
  }

  private async requireEnvironmentInTenant(projectEnvironmentId: string, tenantId: string): Promise<void> {
    const [row] = await db
      .select({ tenantId: projects.tenantId })
      .from(projectEnvironments)
      .innerJoin(projects, eq(projects.id, projectEnvironments.projectId))
      .where(eq(projectEnvironments.id, projectEnvironmentId));

    if (!row) throw new BadRequestException(`Unknown environment ${projectEnvironmentId}`);
    if (row.tenantId !== tenantId) {
      throw new BadRequestException('That environment belongs to a different organization than the channel');
    }
  }

  private async countRoutes(channelId: string): Promise<number> {
    const [row] = await db
      .select({ routeCount: count() })
      .from(whapiChatRoutes)
      .where(eq(whapiChatRoutes.whapiChannelId, channelId));

    return Number(row?.routeCount ?? 0);
  }

  private toChannelResponse(
    channel: ChannelRow,
    context: { tenantName: string; tenantDisplayName: string; routeCount: number }
  ): WhapiChannelResponse {
    return {
      id: channel.id,
      channelId: channel.channelId,
      tenantId: channel.tenantId,
      tenantName: context.tenantName,
      tenantDisplayName: context.tenantDisplayName,
      label: channel.label,
      apiTokenPreview: tokenPreview(channel.apiToken),
      webhookSecret: channel.webhookSecret,
      webhookUrl: this.defaultWebhookUrl(),
      routeCount: context.routeCount,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    };
  }
}

function generateWebhookSecret(): string {
  return crypto.randomBytes(WEBHOOK_SECRET_BYTES).toString('base64url');
}

function tokenPreview(apiToken: string): string {
  return `…${apiToken.slice(-TOKEN_PREVIEW_LENGTH)}`;
}

function requireText(value: string | undefined, field: string, maxLength: number): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) throw new BadRequestException(`${field} is required`);
  if (trimmed.length > maxLength) throw new BadRequestException(`${field} must be at most ${maxLength} characters`);
  return trimmed;
}

function optionalText(value: string | null | undefined, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) throw new BadRequestException(`${field} must be at most ${maxLength} characters`);
  return trimmed;
}

function requireChatId(value: string | undefined): string {
  const chatId = requireText(value, 'chatId', CHAT_ID_MAX_LENGTH);
  if (!CHAT_ID_PATTERN.test(chatId)) {
    throw new BadRequestException(
      `Invalid chat id "${chatId}", expected a Whapi chat id such as 1234567890@s.whatsapp.net or 1234567890@g.us`
    );
  }
  return chatId;
}
