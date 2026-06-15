import { api, type Agent } from './client';
import { createAppQuery } from '~/lib/create-app-query';

export const agentKeys = {
  all: ['agents'] as const,
  list: () => [...agentKeys.all, 'list'] as const,
};

export function useAgents() {
  return createAppQuery(() => ({
    queryKey: agentKeys.list(),
    queryFn: () => api.get<Agent[]>('/agents'),
    refetchOnWindowFocus: false,
  }));
}
