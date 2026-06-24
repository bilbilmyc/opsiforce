import type { DuplicateJobStatus } from '~/api/duplicate';

export interface DuplicateStep {
  key: Exclude<DuplicateJobStatus, 'failed'>;
  label: string;
  detail: string;
}

export const DUPLICATE_STEPS: DuplicateStep[] = [
  { key: 'queued', label: 'Queued', detail: 'Waiting to start' },
  { key: 'committing', label: 'Saving changes', detail: 'Capturing the latest version' },
  { key: 'cloning', label: 'Preparing copy', detail: 'Cloning the project' },
  { key: 'copying', label: 'Copying data', detail: 'Copying databases and conversation history' },
  { key: 'starting', label: 'Starting the app', detail: 'Launching the copied project' },
  { key: 'completed', label: 'Ready', detail: 'The copied app is online' },
];

const DUPLICATE_STEP_ORDER: DuplicateJobStatus[] = [
  'queued',
  'committing',
  'cloning',
  'copying',
  'starting',
  'completed',
];

export function duplicateStepIndex(status: DuplicateJobStatus): number {
  const idx = DUPLICATE_STEP_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}
