import type { PublishJobStatus } from "~/api/publish"

export interface PublishStep {
  key: Exclude<PublishJobStatus, "done" | "failed">
  label: string
  detail: string
}

export const PUBLISH_STEPS: PublishStep[] = [
  { key: "queued", label: "Queued", detail: "Waiting for a build slot" },
  { key: "committing", label: "Committing", detail: "Snapshotting the Development files" },
  { key: "swapping", label: "Swapping", detail: "Switching the environment to the new version" },
  { key: "building", label: "Building", detail: "Restarting the app and installing dependencies" },
  {
    key: "migrating",
    label: "Migrating",
    detail: "Applying database migrations and waiting for the app to start",
  },
]

export const PUBLISH_STEP_ORDER: PublishJobStatus[] = [
  "queued",
  "committing",
  "swapping",
  "building",
  "migrating",
  "done",
]

export function publishStepIndex(status: PublishJobStatus): number {
  const idx = PUBLISH_STEP_ORDER.indexOf(status)
  return idx === -1 ? 0 : idx
}
