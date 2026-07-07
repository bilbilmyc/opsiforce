import { createEffect, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { AgentStatus, Project } from './client';

interface AgentStatusEvent {
  projectId: string;
  agentStatus: AgentStatus;
}

const [agentStatuses, setAgentStatuses] = createStore<Record<string, AgentStatus>>({});

export function isAgentWorking(projectId: string): boolean {
  return agentStatuses[projectId] === 'working';
}

export function useAgentStatusStream(projects: () => Project[] | undefined): void {
  createEffect(() => {
    for (const project of projects() ?? []) {
      if (!(project.id in agentStatuses)) {
        setAgentStatuses(project.id, project.agentStatus ?? 'idle');
      }
    }
  });

  const events = new EventSource(agentStatusEventsUrl());
  events.addEventListener('message', (event) => {
    try {
      const { projectId, agentStatus } = JSON.parse(event.data) as AgentStatusEvent;
      setAgentStatuses(projectId, agentStatus);
    } catch {
    }
  });
  onCleanup(() => events.close());
}

function agentStatusEventsUrl(): string {
  const params = new URLSearchParams();
  const tenant = localStorage.getItem('tenant');
  if (tenant) params.set('tenant', tenant);
  const query = params.toString();
  return `/api/agent-status/events${query ? `?${query}` : ''}`;
}
