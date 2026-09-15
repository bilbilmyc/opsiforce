import { t } from '~/i18n';
import type { ExportJobStatus } from '~/api/export';

export interface ExportStep {
  key: Exclude<ExportJobStatus, 'failed'>;
  label: string;
  detail: string;
}

export const EXPORT_STEPS: ExportStep[] = [
  { key: 'queued', get label() { return t("Queued"); }, get detail() { return t("Waiting to start"); } },
  { key: 'committing', get label() { return t("Saving changes"); }, get detail() { return t("Capturing the latest version"); } },
  { key: 'staging', get label() { return t("Preparing files"); }, get detail() { return t("Staging the workspace and its history"); } },
  { key: 'archiving', get label() { return t("Packaging"); }, get detail() { return t("Building the export file"); } },
  { key: 'completed', get label() { return t("Ready"); }, get detail() { return t("Export file is ready to download"); } },
];

const EXPORT_STEP_ORDER: ExportJobStatus[] = ['queued', 'committing', 'staging', 'archiving', 'completed'];

export function exportStepIndex(status: ExportJobStatus): number {
  const idx = EXPORT_STEP_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}
