import { createEffect, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import { createTenantState } from '~/lib/tenant-state';
import type { AgentStatus, Project } from './client';
import { whilePageVisible } from '~/lib/visible-stream';
import { createStatusSource } from '~/lib/status-source';

interface AgentStatusEvent {
  projectId: string;
  agentStatus: AgentStatus;
}

const [agentStatuses, setAgentStatuses] = createStore<Record<string, AgentStatus>>({});

export function isAgentWorking(projectId: string): boolean {
  return agentStatuses[projectId] === 'working';
}

export function useAgentStatusStream(projects: () => Project[] | undefined): void {
  const [tenant] = createTenantState();

  createEffect(() => {
    const tenantName = tenant();
    const currentProjects = projects() ?? [];
    setAgentStatuses({});
    for (const project of currentProjects) {
      setAgentStatuses(project.id, project.agentStatus ?? 'idle');
    }

    const dispose = whilePageVisible(() => {
      const events = createStatusSource(agentStatusEventsUrl(tenantName));
      events.addEventListener('message', (event) => {
        try {
          const { projectId, agentStatus } = JSON.parse(event.data) as AgentStatusEvent;
          setAgentStatuses(projectId, agentStatus);
        } catch {}
      });
      return () => events.close();
    });
    onCleanup(dispose);
  });
}

function agentStatusEventsUrl(tenant: string): string {
  const params = new URLSearchParams();
  if (tenant) params.set('tenant', tenant);
  const query = params.toString();
  return `/api/agent-status/events${query ? `?${query}` : ''}`;
}
