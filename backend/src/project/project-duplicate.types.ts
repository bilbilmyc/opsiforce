export const PROJECT_DUPLICATE_QUEUE = 'project-duplicate';

export const ProjectDuplicateStatus = {
  Queued: 'queued',
  Committing: 'committing',
  Cloning: 'cloning',
  Copying: 'copying',
  Starting: 'starting',
  Completed: 'completed',
  Failed: 'failed',
} as const;

export type ProjectDuplicateStatus = (typeof ProjectDuplicateStatus)[keyof typeof ProjectDuplicateStatus];

export const ACTIVE_DUPLICATE_STATUSES: ProjectDuplicateStatus[] = [
  ProjectDuplicateStatus.Queued,
  ProjectDuplicateStatus.Committing,
  ProjectDuplicateStatus.Cloning,
  ProjectDuplicateStatus.Copying,
  ProjectDuplicateStatus.Starting,
];

export interface ProjectDuplicateJobData {
  duplicateJobId: string;
  sourceProjectId: string;
  targetProjectId: string;
}
