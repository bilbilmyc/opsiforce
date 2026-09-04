import { createEffect, createSignal, type Accessor, type Component } from 'solid-js';
import type { BaseRouterProps } from '@solidjs/router';
import { api, type OpenCodeSession, type ProjectStatus } from '~/api/client';
import type { ProjectEnvironmentStatus } from '~/api/environments';
import { useSyncProjectTitle } from '~/api/projects';
import { createSessionRouter } from './platform';

type ConnectionStatus = ProjectStatus | ProjectEnvironmentStatus;

export interface OpenCodeConnectionOptions {
  projectId: string;
  environmentId: Accessor<string>;
  status: Accessor<ConnectionStatus | undefined>;
  rememberedSessionId: Accessor<string | null | undefined>;
  currentTitle: Accessor<string | null | undefined>;
  onResolveSession: (environmentId: string, sessionId: string) => void;
  initialPrompt?: string;
}

export function useOpenCodeConnection(options: OpenCodeConnectionOptions) {
  const [router, setRouter] = createSignal<Component<BaseRouterProps> | null>(null);
  const syncProjectTitle = useSyncProjectTitle();

  let connecting = false;
  let prevStatus: ConnectionStatus | undefined;
  let prevEnvId: string | undefined;

  const syncTitle = (title: string) => syncProjectTitle(options.projectId, title, options.currentTitle());

  async function resolveSessionId(environmentId: string): Promise<string | undefined> {
    try {
      const response = await api.get<{ data?: OpenCodeSession[] }>(
        `/proxy/${environmentId}/api/session?parentID=null&order=asc`
      );
      const roots = Array.isArray(response?.data) ? response.data : [];
      if (roots.length === 0) return undefined;
      const remembered = options.rememberedSessionId();
      const pinned = remembered ? roots.find((s) => s.id === remembered) : undefined;
      const chosen = pinned ?? roots.toSorted((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0))[0];
      if (!chosen) return undefined;
      if (chosen.title) syncTitle(chosen.title);
      if (chosen.id !== remembered) options.onResolveSession(environmentId, chosen.id);
      return chosen.id;
    } catch {
      return undefined;
    }
  }

  async function createSession(environmentId: string): Promise<string | undefined> {
    try {
      const created = await api.post<{ data?: OpenCodeSession }>(`/proxy/${environmentId}/api/session`, {});
      const session = created?.data;
      if (!session?.id) return undefined;
      if (options.initialPrompt && environmentId === options.projectId) {
        await api.post(`/proxy/${environmentId}/api/session/${session.id}/prompt`, {
          text: options.initialPrompt,
        });
      }
      options.onResolveSession(environmentId, session.id);
      return session.id;
    } catch {
      return undefined;
    }
  }

  async function connect(environmentId: string) {
    const isActiveEnv = () => environmentId === options.environmentId();
    const existingSessionId = await resolveSessionId(environmentId);
    if (!isActiveEnv()) return;
    const sessionId = existingSessionId ?? (await createSession(environmentId));
    if (!isActiveEnv()) return;
    if (!sessionId) {
      connecting = false;
      return;
    }
    const serverUrl = `${window.location.origin}/api/proxy/${environmentId}`;
    setRouter(() => createSessionRouter(serverUrl, sessionId));
  }

  function reset() {
    setRouter(null);
    connecting = false;
  }

  createEffect(() => {
    const status = options.status();
    const envId = options.environmentId();
    if (!status) return;

    if (envId !== prevEnvId) {
      reset();
      prevEnvId = envId;
      prevStatus = undefined;
    }

    if (status === 'disabled') {
      reset();
      prevStatus = status;
      return;
    }

    if (status === 'starting' && prevStatus && prevStatus !== 'starting') {
      reset();
    }

    if (status === 'active' && !connecting) {
      connecting = true;
      connect(envId);
    }

    prevStatus = status;
  });

  return { router, reset };
}
