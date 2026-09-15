import { t } from '~/i18n';
import type { ImportJobStatus } from '~/api/import';

export type ImportPhase = 'uploading' | ImportJobStatus;

export interface ImportStep {
  key: Exclude<ImportPhase, 'failed'>;
  label: string;
  detail: string;
}

export const IMPORT_STEPS: ImportStep[] = [
  { key: 'uploading', get label() { return t("Uploading"); }, get detail() { return t("Sending the export file"); } },
  { key: 'queued', get label() { return t("Queued"); }, get detail() { return t("Waiting to start"); } },
  { key: 'unpacking', get label() { return t("Unpacking"); }, get detail() { return t("Restoring the workspace files"); } },
  { key: 'starting', get label() { return t("Starting the app"); }, get detail() { return t("Launching the imported project"); } },
  { key: 'completed', get label() { return t("Ready"); }, get detail() { return t("The imported app is online"); } },
];

const IMPORT_STEP_ORDER: ImportPhase[] = ['uploading', 'queued', 'unpacking', 'starting', 'completed'];

export function importStepIndex(phase: ImportPhase): number {
  const idx = IMPORT_STEP_ORDER.indexOf(phase);
  return idx === -1 ? 0 : idx;
}
