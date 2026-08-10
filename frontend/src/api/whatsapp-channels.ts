import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { createAppQuery } from '~/lib/create-app-query';
import { api } from './client';
import { EXTERNAL_SERVICES_ADMIN_BASE } from './external-services';

export interface WhatsappChannel {
  channelId: string;
  label: string | null;
  apiTokenPreview: string;
  webhookUrl: string;
  referencedEnvironmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export type WhatsappWebhookState = 'in-sync' | 'stale-url' | 'stale-secret' | 'missing-event' | 'not-configured';

export interface WhatsappWebhookStatus {
  state: WhatsappWebhookState;
  configuredUrl: string | null;
  expectedUrl: string;
}

export interface WhatsappAllowedChat {
  chatId: string;
  chatName: string | null;
}

export interface WhatsappAvailableChannel {
  channelId: string;
  label: string | null;
}

export interface WhatsappEnvironmentChannel {
  channelId: string;
  label: string | null;
  registered: boolean;
  allowedChats: WhatsappAllowedChat[];
}

export interface WhatsappChatOption {
  chatId: string;
  name: string | null;
  kind: 'individual' | 'group';
}

export interface CreateWhatsappChannelDto {
  channelId: string;
  apiToken: string;
  label?: string | null;
}

export interface UpdateWhatsappChannelDto {
  apiToken?: string;
  label?: string | null;
}

export interface ConfigureWhatsappWebhookResult {
  webhookUrl: string;
  secretHeader: string;
}

const BASE = `${EXTERNAL_SERVICES_ADMIN_BASE}/whatsapp`;

export const whatsappKeys = {
  all: ['whatsapp'] as const,
  channels: () => [...whatsappKeys.all, 'channels'] as const,
  chats: (channelId: string) => [...whatsappKeys.all, 'chats', channelId] as const,
  webhookStatus: (channelId: string) => [...whatsappKeys.all, 'webhook-status', channelId] as const,
  environment: (projectEnvironmentId: string) => [...whatsappKeys.all, 'environment', projectEnvironmentId] as const,
  availableChannels: (projectEnvironmentId: string) =>
    [...whatsappKeys.all, 'available-channels', projectEnvironmentId] as const,
  environmentChats: (projectEnvironmentId: string, channelId: string) =>
    [...whatsappKeys.all, 'environment-chats', projectEnvironmentId, channelId] as const,
};

export function useWhatsappChannels(options?: { enabled?: () => boolean }) {
  return createAppQuery(() => ({
    queryKey: whatsappKeys.channels(),
    queryFn: () => api.get<WhatsappChannel[]>(`${BASE}/channels`),
    enabled: options?.enabled ? options.enabled() : true,
    reconcile: 'channelId',
  }));
}

export function useWhatsappChats(channelId: () => string | null, enabled: () => boolean) {
  return createAppQuery(() => ({
    queryKey: whatsappKeys.chats(channelId() ?? 'none'),
    queryFn: () => api.get<WhatsappChatOption[]>(`${BASE}/channels/${encodeURIComponent(channelId() ?? '')}/chats`),
    enabled: channelId() !== null && enabled(),
    reconcile: false,
    retry: false,
  }));
}

export function useAvailableWhatsappChannels(projectEnvironmentId: () => string) {
  return createAppQuery(() => ({
    queryKey: whatsappKeys.availableChannels(projectEnvironmentId()),
    queryFn: () =>
      api.get<WhatsappAvailableChannel[]>(
        `${BASE}/environments/${encodeURIComponent(projectEnvironmentId())}/available-channels`
      ),
    enabled: projectEnvironmentId() !== '',
    reconcile: 'channelId',
  }));
}

export function useEnvironmentWhatsappChats(
  projectEnvironmentId: () => string,
  channelId: () => string | null,
  enabled: () => boolean
) {
  return createAppQuery(() => ({
    queryKey: whatsappKeys.environmentChats(projectEnvironmentId(), channelId() ?? 'none'),
    queryFn: () =>
      api.get<WhatsappChatOption[]>(
        `${BASE}/environments/${encodeURIComponent(projectEnvironmentId())}/channels/${encodeURIComponent(channelId() ?? '')}/chats`
      ),
    enabled: channelId() !== null && enabled(),
    reconcile: false,
    retry: false,
  }));
}

export function useWhatsappWebhookStatus(channelId: () => string) {
  return createAppQuery(() => ({
    queryKey: whatsappKeys.webhookStatus(channelId()),
    queryFn: () => api.get<WhatsappWebhookStatus>(`${BASE}/channels/${encodeURIComponent(channelId())}/webhook-status`),
    reconcile: false,
    retry: false,
  }));
}

export function useEnvironmentWhatsappChannels(projectEnvironmentId: () => string, enabled: () => boolean) {
  return createAppQuery(() => ({
    queryKey: whatsappKeys.environment(projectEnvironmentId()),
    queryFn: () =>
      api.get<WhatsappEnvironmentChannel[]>(
        `${BASE}/environments/${encodeURIComponent(projectEnvironmentId())}/channels`
      ),
    enabled: projectEnvironmentId() !== '' && enabled(),
    reconcile: false,
  }));
}

export function useCreateWhatsappChannel() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (dto: CreateWhatsappChannelDto) => api.post<WhatsappChannel>(`${BASE}/channels`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.channels() }),
  }));
}

export function useUpdateWhatsappChannel() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (params: { channelId: string; dto: UpdateWhatsappChannelDto }) =>
      api.patch<WhatsappChannel>(`${BASE}/channels/${encodeURIComponent(params.channelId)}`, params.dto),
    onSuccess: (_result, params) => {
      qc.invalidateQueries({ queryKey: whatsappKeys.channels() });
      qc.invalidateQueries({ queryKey: whatsappKeys.webhookStatus(params.channelId) });
      qc.invalidateQueries({ queryKey: whatsappKeys.chats(params.channelId) });
    },
  }));
}

export function useDeleteWhatsappChannel() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (channelId: string) => api.delete<{ ok: true }>(`${BASE}/channels/${encodeURIComponent(channelId)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.channels() }),
  }));
}

export function useRotateWhatsappSecret() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (channelId: string) =>
      api.post<WhatsappChannel>(`${BASE}/channels/${encodeURIComponent(channelId)}/rotate-secret`),
    onSuccess: (_result, channelId) => {
      qc.invalidateQueries({ queryKey: whatsappKeys.channels() });
      qc.invalidateQueries({ queryKey: whatsappKeys.webhookStatus(channelId) });
    },
  }));
}

export function useConfigureWhatsappWebhook() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (params: { channelId: string; webhookUrl: string }) =>
      api.post<ConfigureWhatsappWebhookResult>(
        `${BASE}/channels/${encodeURIComponent(params.channelId)}/configure-webhook`,
        { webhookUrl: params.webhookUrl }
      ),
    onSuccess: (_result, vars) => qc.invalidateQueries({ queryKey: whatsappKeys.webhookStatus(vars.channelId) }),
  }));
}

export function useAllowlistWhatsappChat() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (params: {
      projectEnvironmentId: string;
      channelId: string;
      dto: { chatId: string; chatName: string | null };
    }) =>
      api.post<WhatsappEnvironmentChannel[]>(
        `${BASE}/environments/${encodeURIComponent(params.projectEnvironmentId)}/channels/${encodeURIComponent(params.channelId)}/chats`,
        params.dto
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: whatsappKeys.environment(vars.projectEnvironmentId) });
      qc.invalidateQueries({ queryKey: whatsappKeys.availableChannels(vars.projectEnvironmentId) });
      qc.invalidateQueries({ queryKey: whatsappKeys.channels() });
    },
  }));
}

export function useRemoveWhatsappChat() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (params: { projectEnvironmentId: string; channelId: string; chatId: string }) =>
      api.delete<WhatsappEnvironmentChannel[]>(
        `${BASE}/environments/${encodeURIComponent(params.projectEnvironmentId)}/channels/${encodeURIComponent(params.channelId)}/chats?chatId=${encodeURIComponent(params.chatId)}`
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: whatsappKeys.environment(vars.projectEnvironmentId) });
      qc.invalidateQueries({ queryKey: whatsappKeys.channels() });
    },
  }));
}
