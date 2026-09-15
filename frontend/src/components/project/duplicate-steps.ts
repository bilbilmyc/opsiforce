import { t } from '~/i18n';
import type { DuplicateJobStatus } from '~/api/duplicate';

export interface DuplicateStep {
  key: Exclude<DuplicateJobStatus, 'failed'>;
  label: string;
  detail: string;
}

export const DUPLICATE_STEPS: DuplicateStep[] = [
  { key: 'queued', get label() { return t("Queued"); }, get detail() { return t("Waiting to start"); } },
  { key: 'committing', get label() { return t("Saving changes"); }, get detail() { return t("Capturing the latest version"); } },
  { key: 'cloning', get label() { return t("Preparing copy"); }, get detail() { return t("Cloning the project"); } },
  { key: 'copying', get label() { return t("Copying data"); }, get detail() { return t("Copying databases and conversation history"); } },
  { key: 'starting', get label() { return t("Starting the app"); }, get detail() { return t("Launching the copied project"); } },
  { key: 'completed', get label() { return t("Ready"); }, get detail() { return t("The copied app is online"); } },
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
