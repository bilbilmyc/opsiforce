import type { ProjectEnvironmentStatus } from "~/api/environments"

export interface EnvStatusMeta {
  label: string
  dot: string
  text: string
  pulse: boolean
}

const STATUS_META: Record<ProjectEnvironmentStatus, EnvStatusMeta> = {
  active: { label: "Active", dot: "bg-emerald-500", text: "text-emerald-600", pulse: false },
  starting: { label: "Starting", dot: "bg-amber-500", text: "text-amber-600", pulse: true },
  claiming: { label: "Claiming", dot: "bg-amber-500", text: "text-amber-600", pulse: true },
  pending: { label: "Pending", dot: "bg-amber-500", text: "text-amber-600", pulse: true },
  suspended: { label: "Suspended", dot: "bg-slate-400", text: "text-muted-foreground", pulse: false },
  disabled: { label: "Disabled", dot: "bg-slate-400", text: "text-muted-foreground", pulse: false },
  failed: { label: "Failed", dot: "bg-destructive", text: "text-destructive", pulse: false },
}

export function envStatusMeta(status: ProjectEnvironmentStatus): EnvStatusMeta {
  return STATUS_META[status]
}
