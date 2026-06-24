export const PROJECT_IMPORT_QUEUE = 'project-import';

export const ProjectImportStatus = {
  Queued: 'queued',
  Unpacking: 'unpacking',
  Starting: 'starting',
  Completed: 'completed',
  Failed: 'failed',
} as const;

export type ProjectImportStatus = (typeof ProjectImportStatus)[keyof typeof ProjectImportStatus];

export const ACTIVE_IMPORT_STATUSES: ProjectImportStatus[] = [
  ProjectImportStatus.Queued,
  ProjectImportStatus.Unpacking,
  ProjectImportStatus.Starting,
];

export interface ProjectImportJobData {
  importJobId: string;
  projectId: string;
  tenantId: string;
  archivePath: string;
}

export interface ProjectImportJobResponse {
  id: string;
  projectId: string;
  status: ProjectImportStatus;
  bytesTotal: number;
  bytesProcessed: number;
  agentFallbackFrom: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StartImportResult {
  projectId: string;
  job: ProjectImportJobResponse;
}
