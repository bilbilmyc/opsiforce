import type { ExportJobStatus } from '~/api/export';

export interface ExportStep {
  key: Exclude<ExportJobStatus, 'failed'>;
  label: string;
  detail: string;
}

export const EXPORT_STEPS: ExportStep[] = [
  { key: 'queued', label: 'Queued', detail: 'Waiting to start' },
  { key: 'committing', label: 'Saving changes', detail: 'Capturing the latest version' },
  { key: 'staging', label: 'Preparing files', detail: 'Staging the workspace and its history' },
  { key: 'archiving', label: 'Packaging', detail: 'Building the export file' },
  { key: 'completed', label: 'Ready', detail: 'Export file is ready to download' },
];

const EXPORT_STEP_ORDER: ExportJobStatus[] = ['queued', 'committing', 'staging', 'archiving', 'completed'];

export function exportStepIndex(status: ExportJobStatus): number {
  const idx = EXPORT_STEP_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}
