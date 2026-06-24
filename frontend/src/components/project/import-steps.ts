import type { ImportJobStatus } from '~/api/import';

export type ImportPhase = 'uploading' | ImportJobStatus;

export interface ImportStep {
  key: Exclude<ImportPhase, 'failed'>;
  label: string;
  detail: string;
}

export const IMPORT_STEPS: ImportStep[] = [
  { key: 'uploading', label: 'Uploading', detail: 'Sending the export file' },
  { key: 'queued', label: 'Queued', detail: 'Waiting to start' },
  { key: 'unpacking', label: 'Unpacking', detail: 'Restoring the workspace files' },
  { key: 'starting', label: 'Starting the app', detail: 'Launching the imported project' },
  { key: 'completed', label: 'Ready', detail: 'The imported app is online' },
];

const IMPORT_STEP_ORDER: ImportPhase[] = ['uploading', 'queued', 'unpacking', 'starting', 'completed'];

export function importStepIndex(phase: ImportPhase): number {
  const idx = IMPORT_STEP_ORDER.indexOf(phase);
  return idx === -1 ? 0 : idx;
}
