export const AGENT_WORKSPACE_UPDATE_QUEUE = 'agent-workspace-update';

export const AgentUpdateStatus = {
  Running: 'running',
  ReloadPending: 'reload_pending',
  Applied: 'applied',
  Conflict: 'conflict',
  Failed: 'failed',
} as const;

export interface AgentProjectJobData {
  projectId: string;
  agentName: string;
  targetVersion: string;
}

export interface AgentReloadJobData {
  updateId: string;
  attempt: number;
}

export type AgentSweepJobData = Record<string, never>;

export type AgentUpdateJobData = AgentProjectJobData | AgentReloadJobData | AgentSweepJobData;

export interface AgentUpdateConflict {
  migrationId: string;
  path: string;
  reason: string;
}

export interface AgentMigrationFailure {
  migrationId: string;
  error: string;
}

export interface AgentWorkspaceMigrationSummary {
  agentName: string;
  targetVersion: string;
  appliedMigrations: string[];
  skippedMigrations: string[];
  failedMigrations: AgentMigrationFailure[];
  conflicts: AgentUpdateConflict[];
  requiresPodRecreate: boolean;
  status: 'applied' | 'conflict' | 'failed';
  error?: string;
}
