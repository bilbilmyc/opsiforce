import { t } from '~/i18n';
import type { PublishJobStatus } from '~/api/publish';

export interface PublishStep {
  key: Exclude<PublishJobStatus, 'done' | 'failed'>;
  label: string;
  detail: string;
}

export const PUBLISH_STEPS: PublishStep[] = [
  { key: 'queued', get label() { return t("Queued"); }, get detail() { return t("Waiting to start"); } },
  { key: 'committing', get label() { return t("Saving changes"); }, get detail() { return t("Capturing the latest version from Development"); } },
  { key: 'swapping', get label() { return t("Preparing release"); }, get detail() { return t("Getting the new version ready to go live"); } },
  { key: 'building', get label() { return t("Starting the app"); }, get detail() { return t("Launching your app and getting it ready"); } },
  { key: 'migrating', get label() { return t("Bringing it online"); }, get detail() { return t("Waiting for your app to respond"); } },
];

export const PUBLISH_STEP_ORDER: PublishJobStatus[] = [
  'queued',
  'committing',
  'swapping',
  'building',
  'migrating',
  'done',
];

export function publishStepIndex(status: PublishJobStatus): number {
  const idx = PUBLISH_STEP_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}
