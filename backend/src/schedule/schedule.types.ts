export interface CreateScheduleDto {
  name: string
  cronPattern: string
  targetPath: string
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

export interface UpdateScheduleDto {
  cronPattern?: string
  targetPath?: string
  method?: string
  body?: unknown
  headers?: Record<string, string>
  isActive?: boolean
}

export type ScheduleTrigger = "cron" | "manual"

export const SCHEDULE_QUEUE_NAME = "project-schedules"

export interface ScheduleJobData {
  scheduleId: string
}
