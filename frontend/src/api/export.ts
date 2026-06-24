import { api } from './client';

export type ExportJobStatus = 'queued' | 'committing' | 'staging' | 'archiving' | 'completed' | 'failed';

export interface ExportJob {
  id: string;
  projectId: string;
  status: ExportJobStatus;
  bytesTotal: number;
  bytesProcessed: number;
  fileName: string | null;
  fileSize: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function startProjectExport(projectId: string): Promise<ExportJob> {
  return api.post<ExportJob>(`/projects/${projectId}/export`);
}

export function exportEventsUrl(projectId: string): string {
  const params = new URLSearchParams();
  const tenant = localStorage.getItem('tenant');
  if (tenant) params.set('tenant', tenant);
  const query = params.toString();
  return `/api/projects/${projectId}/export/job/stream${query ? `?${query}` : ''}`;
}

export function triggerExportDownload(projectId: string, jobId: string, fileName?: string): void {
  const params = new URLSearchParams({ jobId });
  const tenant = localStorage.getItem('tenant');
  if (tenant) params.set('tenant', tenant);
  const link = document.createElement('a');
  link.href = `/api/projects/${projectId}/export/download?${params.toString()}`;
  link.download = fileName ?? 'project-export.zip';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
