import type { PublishJobStatus } from '~/api/publish';

export interface PublishStep {
  key: Exclude<PublishJobStatus, 'done' | 'failed'>;
  label: string;
  detail: string;
}

export const PUBLISH_STEPS: PublishStep[] = [
  { key: 'queued', label: 'Queued', detail: 'Waiting to start' },
  { key: 'committing', label: 'Saving changes', detail: 'Capturing the latest version from Development' },
  { key: 'swapping', label: 'Preparing release', detail: 'Getting the new version ready to go live' },
  { key: 'building', label: 'Starting the app', detail: 'Launching your app and getting it ready' },
  { key: 'migrating', label: 'Bringing it online', detail: 'Waiting for your app to respond' },
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
