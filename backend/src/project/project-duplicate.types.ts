export const PROJECT_DUPLICATE_QUEUE = "project-duplicate"

export const ProjectDuplicateStatus = {
  Queued: "queued",
  Copying: "copying",
  Starting: "starting",
  Completed: "completed",
  Failed: "failed",
} as const

export type ProjectDuplicateStatus = (typeof ProjectDuplicateStatus)[keyof typeof ProjectDuplicateStatus]

export interface ProjectDuplicateJobData {
  duplicateJobId: string
  sourceProjectId: string
  targetProjectId: string
}
