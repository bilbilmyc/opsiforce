import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { createAppQuery } from '~/lib/create-app-query';
import { api } from './client';

export interface WhapiOrganization {
  tenantId: string;
  tenantName: string;
  tenantDisplayName: string;
}

export interface WhapiChannel {
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
  createdAt: string;
  updatedAt: string;
}

export interface WhapiChatRoute {
  id: string;
  chatId: string;
  chatName: string | null;
  projectEnvironmentId: string;
  projectId: string;
  projectTitle: string | null;
  environmentName: string;
  createdAt: string;
}

export interface WhapiRoutableEnvironment {
  projectEnvironmentId: string;
  projectId: string;
  projectTitle: string | null;
  environmentName: string;
  isDefault: boolean;
}

export interface WhapiChatOption {
  chatId: string;
  name: string | null;
  kind: 'individual' | 'group';
}

export interface CreateWhapiChannelDto {
  channelId: string;
  tenantId: string;
  apiToken: string;
  label?: string | null;
}

export interface UpdateWhapiChannelDto {
  apiToken?: string;
  label?: string | null;
}

export interface ConfigureWhapiWebhookResult {
  webhookUrl: string;
  secretHeader: string;
}

const BASE = '/admin/whatsapp';

export const whapiKeys = {
  all: ['whapi'] as const,
  organizations: () => [...whapiKeys.all, 'organizations'] as const,
  channels: () => [...whapiKeys.all, 'channels'] as const,
  routes: (id: string) => [...whapiKeys.all, 'routes', id] as const,
  environments: (id: string) => [...whapiKeys.all, 'environments', id] as const,
  chats: (id: string) => [...whapiKeys.all, 'chats', id] as const,
};

export function useWhapiOrganizations() {
  return createAppQuery(() => ({
    queryKey: whapiKeys.organizations(),
    queryFn: () => api.get<WhapiOrganization[]>(`${BASE}/organizations`),
    reconcile: false,
  }));
}

export function useWhapiChannels() {
  return createAppQuery(() => ({
    queryKey: whapiKeys.channels(),
    queryFn: () => api.get<WhapiChannel[]>(`${BASE}/channels`),
  }));
}

export function useWhapiChatRoutes(channelId: () => string | null) {
  return createAppQuery(() => ({
    queryKey: whapiKeys.routes(channelId() ?? 'none'),
    queryFn: () => api.get<WhapiChatRoute[]>(`${BASE}/channels/${channelId()}/routes`),
    enabled: channelId() !== null,
  }));
}

export function useWhapiRoutableEnvironments(channelId: () => string | null) {
  return createAppQuery(() => ({
    queryKey: whapiKeys.environments(channelId() ?? 'none'),
    queryFn: () => api.get<WhapiRoutableEnvironment[]>(`${BASE}/channels/${channelId()}/environments`),
    enabled: channelId() !== null,
    reconcile: false,
  }));
}

export function useWhapiChats(channelId: () => string | null, enabled: () => boolean) {
  return createAppQuery(() => ({
    queryKey: whapiKeys.chats(channelId() ?? 'none'),
    queryFn: () => api.get<WhapiChatOption[]>(`${BASE}/channels/${channelId()}/chats`),
    enabled: channelId() !== null && enabled(),
    reconcile: false,
    retry: false,
  }));
}

export function useCreateWhapiChannel() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (dto: CreateWhapiChannelDto) => api.post<WhapiChannel>(`${BASE}/channels`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: whapiKeys.channels() }),
  }));
}

export function useUpdateWhapiChannel() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (params: { id: string; dto: UpdateWhapiChannelDto }) =>
      api.patch<WhapiChannel>(`${BASE}/channels/${params.id}`, params.dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: whapiKeys.channels() }),
  }));
}

export function useDeleteWhapiChannel() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`${BASE}/channels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: whapiKeys.channels() }),
  }));
}

export function useConfigureWhapiWebhook() {
  return createMutation(() => ({
    mutationFn: (params: { id: string; webhookUrl: string }) =>
      api.post<ConfigureWhapiWebhookResult>(`${BASE}/channels/${params.id}/configure-webhook`, {
        webhookUrl: params.webhookUrl,
      }),
  }));
}

export function useCreateWhapiChatRoute() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (params: {
      id: string;
      dto: { chatId: string; chatName?: string | null; projectEnvironmentId: string };
    }) => api.post<WhapiChatRoute>(`${BASE}/channels/${params.id}/routes`, params.dto),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: whapiKeys.routes(vars.id) });
      qc.invalidateQueries({ queryKey: whapiKeys.channels() });
    },
  }));
}

export function useDeleteWhapiChatRoute() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (params: { id: string; routeId: string }) =>
      api.delete<{ ok: true }>(`${BASE}/channels/${params.id}/routes/${params.routeId}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: whapiKeys.routes(vars.id) });
      qc.invalidateQueries({ queryKey: whapiKeys.channels() });
    },
  }));
}
