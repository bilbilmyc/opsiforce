import { createContext, useContext } from 'solid-js';
import type { PublishJob } from '~/api/publish';
import type { DuplicateJob } from '~/api/duplicate';
import type { ExportJob } from '~/api/export';
import type { ImportJob } from '~/api/import';

export type JobKind = 'publish' | 'duplicate' | 'export' | 'import';

interface TrackedBase {
  key: string;
  kind: JobKind;
  id: string;
  projectId: string;
  title: string;
  lastStep: string;
}

export interface TrackedPublish extends TrackedBase {
  kind: 'publish';
  environmentSlug: string;
  job: PublishJob | null;
}

export interface TrackedDuplicate extends TrackedBase {
  kind: 'duplicate';
  job: DuplicateJob | null;
}

export interface TrackedExport extends TrackedBase {
  kind: 'export';
  job: ExportJob;
}

export interface TrackedImport extends TrackedBase {
  kind: 'import';
  job: ImportJob;
}

export type TrackedJob = TrackedPublish | TrackedDuplicate | TrackedExport | TrackedImport;

export interface ProjectViewHandlers {
  onPublishDone?: (job: PublishJob) => void;
  viewEnvironment?: (projectEnvironmentId: string) => void;
}

export interface JobDockApi {
  trackPublish: (input: {
    projectId: string;
    environmentId: string;
    environmentName: string;
    environmentSlug: string;
  }) => void;
  trackDuplicate: (input: { projectId: string; title: string }) => void;
  trackExport: (input: { projectId: string; title: string; job: ExportJob }) => void;
  trackImport: (input: { projectId: string; title: string; job: ImportJob }) => void;
  entries: () => TrackedJob[];
  registerProjectView: (projectId: string, handlers: ProjectViewHandlers) => () => void;
}

export const JobDockContext = createContext<JobDockApi>();

export function useJobDock(): JobDockApi {
  const ctx = useContext(JobDockContext);
  if (!ctx) throw new Error('useJobDock must be used within JobDockHost');
  return ctx;
}
