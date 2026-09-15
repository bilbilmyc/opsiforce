import { t } from '~/i18n';
import type { ProjectEnvironmentStatus } from '~/api/environments';

export interface EnvStatusMeta {
  label: string;
  dot: string;
  text: string;
  pulse: boolean;
}

const STATUS_META: Record<ProjectEnvironmentStatus, EnvStatusMeta> = {
  active: { get label() { return t("Active"); }, dot: 'bg-emerald-500', text: 'text-emerald-600', pulse: false },
  starting: { get label() { return t("Starting"); }, dot: 'bg-amber-500', text: 'text-amber-600', pulse: true },
  publishing: { get label() { return t("Publishing"); }, dot: 'bg-amber-500', text: 'text-amber-600', pulse: true },
  claiming: { get label() { return t("Claiming"); }, dot: 'bg-amber-500', text: 'text-amber-600', pulse: true },
  pending: { get label() { return t("Pending"); }, dot: 'bg-amber-500', text: 'text-amber-600', pulse: true },
  suspended: { get label() { return t("Suspended"); }, dot: 'bg-slate-400', text: 'text-muted-foreground', pulse: false },
  disabled: { get label() { return t("Disabled"); }, dot: 'bg-slate-400', text: 'text-muted-foreground', pulse: false },
  failed: { get label() { return t("Failed"); }, dot: 'bg-destructive', text: 'text-destructive', pulse: false },
};

export function envStatusMeta(status: ProjectEnvironmentStatus): EnvStatusMeta {
  return STATUS_META[status];
}
