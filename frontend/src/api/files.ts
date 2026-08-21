import { createAppQuery } from '~/lib/create-app-query';
import { api, currentTenant } from './client';
import { projectKeys } from './projects';

export type FileEntryType = 'file' | 'directory';

export interface FileEntry {
  name: string;
  path: string;
  type: FileEntryType;
  size: number;
  modifiedAt: string;
}

export type FilesSectionKey = 'uploads' | 'generated' | 'other';

export interface FilesSection {
  key: FilesSectionKey;
  path: string;
  entries: FileEntry[];
}

export interface FilesRootListing {
  kind: 'root';
  path: string;
  sections: FilesSection[];
}

export interface FilesDirectoryListing {
  kind: 'directory';
  path: string;
  entries: FileEntry[];
}

export type FilesListing = FilesRootListing | FilesDirectoryListing;

export const GENERATED_FILES_DIRECTORY = 'generated_files';

export const fileKeys = {
  listing: (projectId: string, environmentId: string, path: string) =>
    [...projectKeys.detail(projectId), 'files', environmentId, path] as const,
};

export function useProjectFiles(
  projectId: () => string,
  environmentId: () => string,
  path: () => string,
  options?: { enabled?: () => boolean }
) {
  return createAppQuery(() => ({
    queryKey: fileKeys.listing(projectId(), environmentId(), path()),
    queryFn: () => {
      const params = new URLSearchParams({ environmentId: environmentId() });
      if (path()) params.set('path', path());
      return api.get<FilesListing>(`/projects/${projectId()}/files?${params.toString()}`);
    },
    enabled: options?.enabled ? options.enabled() : true,
    reconcile: 'path',
  }));
}

export function uploadUrl(projectId: string, environmentId: string, targetPath?: string): string {
  const params = new URLSearchParams({ environmentId });
  if (targetPath) params.set('targetPath', targetPath);
  return `/api/projects/${projectId}/upload?${params.toString()}`;
}

export function deleteProjectFile(projectId: string, environmentId: string, path: string): Promise<void> {
  const params = new URLSearchParams({ environmentId, path });
  return api.delete<void>(`/projects/${projectId}/files?${params.toString()}`);
}

export function deletionCoversPath(deletedPath: string, path: string): boolean {
  return path === deletedPath || path.startsWith(`${deletedPath}/`);
}

export type ConversionStatus = 'pending' | 'complete' | 'failed';

export type ConversionFailure = 'unconvertible' | 'retryable' | 'busy';

export interface ConversionJob {
  jobId: string;
}

export interface ConversionProgress {
  status: ConversionStatus;
  failure?: ConversionFailure;
  error?: string;
}

export function startFileConversion(projectId: string, environmentId: string, path: string): Promise<ConversionJob> {
  return api.post<ConversionJob>(`/projects/${projectId}/files/convert`, { environmentId, path });
}

export function readFileConversion(
  projectId: string,
  environmentId: string,
  jobId: string
): Promise<ConversionProgress> {
  const params = new URLSearchParams({ environmentId });
  return api.get<ConversionProgress>(`/projects/${projectId}/files/convert/${jobId}?${params.toString()}`);
}

export function fileConversionResultUrl(projectId: string, environmentId: string, jobId: string): string {
  const params = new URLSearchParams({ environmentId });
  const tenant = currentTenant();
  if (tenant) params.set('tenant', tenant);
  return `/api/projects/${projectId}/files/convert/${jobId}/result?${params.toString()}`;
}

export function fileDownloadUrl(projectId: string, environmentId: string, path: string): string {
  return workspaceFileUrl(projectId, 'download', environmentId, path);
}

export function fileContentUrl(projectId: string, environmentId: string, path: string): string {
  return workspaceFileUrl(projectId, 'content', environmentId, path);
}

function workspaceFileUrl(projectId: string, surface: 'download' | 'content', environmentId: string, path: string) {
  const params = new URLSearchParams({ environmentId, path });
  const tenant = currentTenant();
  if (tenant) params.set('tenant', tenant);
  return `/api/projects/${projectId}/files/${surface}?${params.toString()}`;
}

export function downloadFile(projectId: string, environmentId: string, entry: { name: string; path: string }) {
  const link = document.createElement('a');
  link.href = fileDownloadUrl(projectId, environmentId, entry.path);
  link.download = entry.name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
