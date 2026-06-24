import type { Component } from 'solid-js';
import type { QueryClient } from '@tanstack/solid-query';
import { Copy, Download, ExternalLink, Layers, Package, Rocket } from '~/components/icons';
import { appPublicUrl } from '~/lib/app-url';
import { environmentKeys } from '~/api/environments';
import { publishEventsUrl, publishKeys, type PublishJob, type PublishJobStatus } from '~/api/publish';
import { duplicateEventsUrl, type DuplicateJob, type DuplicateJobStatus } from '~/api/duplicate';
import { exportEventsUrl, triggerExportDownload, type ExportJob, type ExportJobStatus } from '~/api/export';
import { importEventsUrl, type ImportJob } from '~/api/import';
import type { ProgressStep } from '~/components/project/step-progress';
import { PUBLISH_STEPS, publishStepIndex } from '~/components/project/environments/publish-steps';
import { DUPLICATE_STEPS, duplicateStepIndex } from '~/components/project/duplicate-steps';
import { EXPORT_STEPS, exportStepIndex } from '~/components/project/export-steps';
import { IMPORT_STEPS, importStepIndex, type ImportPhase } from '~/components/project/import-steps';
import type {
  JobKind,
  TrackedDuplicate,
  TrackedExport,
  TrackedImport,
  TrackedJob,
  TrackedPublish,
} from './job-dock-context';

type AnyJob = PublishJob | DuplicateJob | ExportJob | ImportJob;
type IconComponent = Component<{ class?: string }>;

export type JobPhase = 'running' | 'done' | 'failed';

export interface JobActionDescriptor {
  label: string;
  icon: IconComponent;
  variant: 'primary' | 'outline';
  href?: string;
  onSelect?: () => void;
}

export interface JobHost {
  qc: QueryClient;
  navigate: (projectId: string) => void;
  dismiss: (key: string) => void;
  projectView: (
    projectId: string
  ) => { onPublishDone?: (job: PublishJob) => void; viewEnvironment?: (id: string) => void } | undefined;
}

export interface JobDisplay {
  phase: JobPhase;
  headerIcon: IconComponent;
  cardTitle: string;
  dialogTitle: string;
  dialogNote: string;
  steps: ProgressStep[];
  currentIndex: number;
  totalSteps: number;
  stepLabel: string;
  progressPercent: number;
  error: string | null;
  notice: string | null;
  accentPulse: boolean;
}

export interface JobKindAdapter<E extends TrackedJob> {
  describe: (entry: E) => JobDisplay;
  actions: (entry: E, host: JobHost) => JobActionDescriptor[];
  sseUrl: (entry: E) => string;
  onTerminal: (entry: E, host: JobHost) => void;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function withByteDetail(
  source: { key: string; label: string; detail: string }[],
  byteKey: string,
  bytesProcessed: number,
  bytesTotal: number
): ProgressStep[] {
  return source.map((step) =>
    step.key === byteKey && bytesTotal > 0
      ? { label: step.label, detail: `${formatBytes(bytesProcessed)} of ${formatBytes(bytesTotal)}` }
      : { label: step.label, detail: step.detail }
  );
}

function runningStepLabel(steps: { label: string }[], index: number): string {
  return `${steps[index]?.label ?? 'Working'} · step ${index + 1} of ${steps.length}`;
}

const publishAdapter: JobKindAdapter<TrackedPublish> = {
  describe(entry) {
    const job = entry.job;
    const phase: JobPhase = !job
      ? 'running'
      : job.status === 'done'
        ? 'done'
        : job.status === 'failed'
          ? 'failed'
          : 'running';
    const runningIndex = job ? publishStepIndex(job.status) : 0;
    return {
      phase,
      headerIcon: Rocket,
      cardTitle:
        phase === 'done'
          ? `${entry.title} is live`
          : phase === 'failed'
            ? `Publish to ${entry.title} failed`
            : `Publishing to ${entry.title}`,
      dialogTitle:
        phase === 'done'
          ? `${entry.title} is live`
          : phase === 'failed'
            ? `Publish to ${entry.title} failed`
            : `Publishing to ${entry.title}`,
      dialogNote: 'Closing this keeps the publish running; a progress card stays in the corner.',
      steps: PUBLISH_STEPS.map((step) => ({ label: step.label, detail: step.detail })),
      currentIndex: phase === 'failed' ? publishStepIndex(entry.lastStep as PublishJobStatus) : runningIndex,
      totalSteps: PUBLISH_STEPS.length,
      stepLabel: job ? runningStepLabel(PUBLISH_STEPS, runningIndex) : 'Starting',
      progressPercent: ((runningIndex + 1) / PUBLISH_STEPS.length) * 100,
      error: job?.error ?? null,
      notice: null,
      accentPulse: true,
    };
  },
  actions(entry, host) {
    const job = entry.job;
    if (!job || job.status !== 'done') return [];
    return [
      {
        label: 'Open app',
        icon: ExternalLink,
        variant: 'outline',
        href: appPublicUrl(job.projectEnvironmentId, entry.environmentSlug),
      },
      {
        label: 'View environment',
        icon: Layers,
        variant: 'outline',
        onSelect: () => {
          const view = host.projectView(entry.projectId);
          if (view?.viewEnvironment) view.viewEnvironment(job.projectEnvironmentId);
          else host.navigate(entry.projectId);
          host.dismiss(entry.key);
        },
      },
    ];
  },
  sseUrl: (entry) => publishEventsUrl(entry.projectId, entry.id),
  onTerminal(entry, host) {
    host.qc.invalidateQueries({ queryKey: environmentKeys.forProject(entry.projectId) });
    host.qc.invalidateQueries({ queryKey: publishKeys.targets(entry.projectId) });
    if (entry.job?.status === 'done') host.projectView(entry.projectId)?.onPublishDone?.(entry.job);
  },
};

const duplicateAdapter: JobKindAdapter<TrackedDuplicate> = {
  describe(entry) {
    const job = entry.job;
    const phase: JobPhase = !job
      ? 'running'
      : job.status === 'completed'
        ? 'done'
        : job.status === 'failed'
          ? 'failed'
          : 'running';
    const runningIndex = job ? duplicateStepIndex(job.status) : 0;
    return {
      phase,
      headerIcon: Copy,
      cardTitle:
        phase === 'done'
          ? `${entry.title} copied`
          : phase === 'failed'
            ? 'Duplicate failed'
            : `Duplicating ${entry.title}`,
      dialogTitle:
        phase === 'done'
          ? `${entry.title} copied`
          : phase === 'failed'
            ? 'Duplicate failed'
            : `Duplicating ${entry.title}`,
      dialogNote: 'Closing this keeps the duplicate running; a progress card stays in the corner.',
      steps: withByteDetail(DUPLICATE_STEPS, 'copying', job?.bytesProcessed ?? 0, job?.bytesTotal ?? 0),
      currentIndex: phase === 'failed' ? duplicateStepIndex(entry.lastStep as DuplicateJobStatus) : runningIndex,
      totalSteps: DUPLICATE_STEPS.length,
      stepLabel: job ? runningStepLabel(DUPLICATE_STEPS, runningIndex) : 'Starting',
      progressPercent: ((runningIndex + 1) / DUPLICATE_STEPS.length) * 100,
      error: job?.error ?? null,
      notice: null,
      accentPulse: false,
    };
  },
  actions(entry, host) {
    if (entry.job?.status !== 'completed') return [];
    return [
      {
        label: 'Open project',
        icon: ExternalLink,
        variant: 'primary',
        onSelect: () => {
          host.navigate(entry.projectId);
          host.dismiss(entry.key);
        },
      },
    ];
  },
  sseUrl: (entry) => duplicateEventsUrl(entry.projectId),
  onTerminal(entry, host) {
    if (entry.job?.status === 'completed') host.qc.invalidateQueries({ queryKey: ['projects'] });
  },
};

const exportAdapter: JobKindAdapter<TrackedExport> = {
  describe(entry) {
    const job = entry.job;
    const phase: JobPhase = job.status === 'completed' ? 'done' : job.status === 'failed' ? 'failed' : 'running';
    const runningIndex = exportStepIndex(job.status);
    return {
      phase,
      headerIcon: Package,
      cardTitle: phase === 'done' ? 'Export ready' : phase === 'failed' ? 'Export failed' : `Exporting ${entry.title}`,
      dialogTitle:
        phase === 'done' ? 'Export ready' : phase === 'failed' ? 'Export failed' : `Exporting ${entry.title}`,
      dialogNote:
        'The export file contains live environment variable values and the full conversation — treat it as sensitive. Closing this keeps the export running; a progress card stays in the corner.',
      steps: withByteDetail(EXPORT_STEPS, 'archiving', job.bytesProcessed, job.bytesTotal),
      currentIndex: phase === 'failed' ? exportStepIndex(entry.lastStep as ExportJobStatus) : runningIndex,
      totalSteps: EXPORT_STEPS.length,
      stepLabel: runningStepLabel(EXPORT_STEPS, runningIndex),
      progressPercent: ((runningIndex + 1) / EXPORT_STEPS.length) * 100,
      error: job.error,
      notice: null,
      accentPulse: false,
    };
  },
  actions(entry, host) {
    const job = entry.job;
    if (job.status !== 'completed') return [];
    return [
      {
        label: 'Download',
        icon: Download,
        variant: 'primary',
        onSelect: () => {
          triggerExportDownload(entry.projectId, job.id, job.fileName ?? undefined);
          host.dismiss(entry.key);
        },
      },
    ];
  },
  sseUrl: (entry) => exportEventsUrl(entry.projectId),
  onTerminal() {},
};

const importAdapter: JobKindAdapter<TrackedImport> = {
  describe(entry) {
    const job = entry.job;
    const phase: JobPhase = job.status === 'completed' ? 'done' : job.status === 'failed' ? 'failed' : 'running';
    const runningIndex = importStepIndex(job.status);
    return {
      phase,
      headerIcon: Package,
      cardTitle:
        phase === 'done'
          ? `${entry.title} imported`
          : phase === 'failed'
            ? 'Import failed'
            : `Importing ${entry.title}`,
      dialogTitle:
        phase === 'done'
          ? `${entry.title} imported`
          : phase === 'failed'
            ? 'Import failed'
            : `Importing ${entry.title}`,
      dialogNote: 'Closing this keeps the import running; a progress card stays in the corner.',
      steps: withByteDetail(IMPORT_STEPS, 'unpacking', job.bytesProcessed, job.bytesTotal),
      currentIndex: phase === 'failed' ? importStepIndex(entry.lastStep as ImportPhase) : runningIndex,
      totalSteps: IMPORT_STEPS.length,
      stepLabel: runningStepLabel(IMPORT_STEPS, runningIndex),
      progressPercent: ((runningIndex + 1) / IMPORT_STEPS.length) * 100,
      error: job.error,
      notice: job.agentFallbackFrom
        ? `The export's agent "${job.agentFallbackFrom}" isn't available here, so the default agent was used instead.`
        : null,
      accentPulse: false,
    };
  },
  actions(entry, host) {
    if (entry.job.status !== 'completed') return [];
    return [
      {
        label: 'Open project',
        icon: ExternalLink,
        variant: 'primary',
        onSelect: () => {
          host.navigate(entry.projectId);
          host.dismiss(entry.key);
        },
      },
    ];
  },
  sseUrl: (entry) => importEventsUrl(entry.projectId),
  onTerminal(entry, host) {
    if (entry.job.status === 'completed') host.qc.invalidateQueries({ queryKey: ['projects'] });
  },
};

export function describeJob(entry: TrackedJob): JobDisplay {
  switch (entry.kind) {
    case 'publish':
      return publishAdapter.describe(entry);
    case 'duplicate':
      return duplicateAdapter.describe(entry);
    case 'export':
      return exportAdapter.describe(entry);
    case 'import':
      return importAdapter.describe(entry);
  }
}

export function jobActions(entry: TrackedJob, host: JobHost): JobActionDescriptor[] {
  switch (entry.kind) {
    case 'publish':
      return publishAdapter.actions(entry, host);
    case 'duplicate':
      return duplicateAdapter.actions(entry, host);
    case 'export':
      return exportAdapter.actions(entry, host);
    case 'import':
      return importAdapter.actions(entry, host);
  }
}

export function jobSseUrl(entry: TrackedJob): string {
  switch (entry.kind) {
    case 'publish':
      return publishAdapter.sseUrl(entry);
    case 'duplicate':
      return duplicateAdapter.sseUrl(entry);
    case 'export':
      return exportAdapter.sseUrl(entry);
    case 'import':
      return importAdapter.sseUrl(entry);
  }
}

export function jobOnTerminal(entry: TrackedJob, host: JobHost): void {
  switch (entry.kind) {
    case 'publish':
      return publishAdapter.onTerminal(entry, host);
    case 'duplicate':
      return duplicateAdapter.onTerminal(entry, host);
    case 'export':
      return exportAdapter.onTerminal(entry, host);
    case 'import':
      return importAdapter.onTerminal(entry, host);
  }
}

export function parseJobFrame(raw: string): AnyJob {
  return JSON.parse(raw) as AnyJob;
}

export function framePhase(kind: JobKind, job: AnyJob): JobPhase {
  if (kind === 'publish') {
    return job.status === 'done' ? 'done' : job.status === 'failed' ? 'failed' : 'running';
  }
  return job.status === 'completed' ? 'done' : job.status === 'failed' ? 'failed' : 'running';
}
