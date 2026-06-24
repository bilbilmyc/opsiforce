import { api, type Project } from './client';

export type DuplicateJobStatus = 'queued' | 'committing' | 'cloning' | 'copying' | 'starting' | 'completed' | 'failed';

export interface DuplicateJob {
  id: string;
  projectId: string;
  status: DuplicateJobStatus;
  bytesTotal: number;
  bytesProcessed: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function startProjectDuplicate(projectId: string): Promise<Project> {
  return api.post<Project>(`/projects/${projectId}/duplicate`);
}

export function duplicateEventsUrl(projectId: string): string {
  const params = new URLSearchParams();
  const tenant = localStorage.getItem('tenant');
  if (tenant) params.set('tenant', tenant);
  const query = params.toString();
  return `/api/projects/${projectId}/duplicate/job/stream${query ? `?${query}` : ''}`;
}
