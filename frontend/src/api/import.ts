import { ApiError } from './client';
import { detectTimezone } from '~/lib/timezone';

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
    return parsed.message ?? fallback;
  } catch {
    return text;
  }
}

export type ImportJobStatus = 'queued' | 'unpacking' | 'starting' | 'completed' | 'failed';

export interface ImportJob {
  id: string;
  projectId: string;
  status: ImportJobStatus;
  bytesTotal: number;
  bytesProcessed: number;
  agentFallbackFrom: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StartImportResult {
  projectId: string;
  job: ImportJob;
}

export async function startProjectImport(params: {
  file: File;
  workspaceId: string | null;
  title: string;
}): Promise<StartImportResult> {
  const form = new FormData();
  if (params.workspaceId) form.set('workspaceId', params.workspaceId);
  if (params.title.trim()) form.set('title', params.title.trim());
  form.set('timezone', detectTimezone());
  form.set('file', params.file, params.file.name);

  const headers: Record<string, string> = {};
  const tenant = localStorage.getItem('tenant');
  if (tenant) headers['x-tenant-name'] = tenant;

  const res = await fetch('/api/projects/import', { method: 'POST', body: form, headers });
  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorMessage(res, `Import failed (${res.status})`));
  }
  return res.json() as Promise<StartImportResult>;
}

export function importEventsUrl(projectId: string): string {
  const params = new URLSearchParams();
  const tenant = localStorage.getItem('tenant');
  if (tenant) params.set('tenant', tenant);
  const query = params.toString();
  return `/api/projects/${projectId}/import/job/stream${query ? `?${query}` : ''}`;
}
