import { t } from '~/i18n';
import { Show } from 'solid-js';
import type { PodDbStatus, PodStatus } from '~/api/pods';
import { Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/tooltip';
import { AlertTriangle, RefreshCw } from '~/components/icons';
import { cn } from '~/lib/cn';

interface PodStatusCellProps {
  status: PodStatus;
  drift: boolean;
  dbStatus: PodDbStatus;
}

interface StatusVisual {
  dot: string;
  label: string;
  bad: boolean;
}

function statusVisual(status: PodStatus): StatusVisual {
  if (status.reason === 'CrashLoopBackOff') return { dot: 'bg-red-500', get label() { return t("CrashLoopBackOff"); }, bad: true };
  if (status.reason === 'ImagePullBackOff') return { dot: 'bg-red-500', get label() { return t("Image pull error"); }, bad: true };
  if (status.reason === 'Unschedulable') return { dot: 'bg-red-500', get label() { return t("Unschedulable"); }, bad: true };
  if (status.phase === 'terminating') return { dot: 'bg-orange-500', get label() { return t("Terminating"); }, bad: false };
  if (status.phase === 'running') {
    return status.ready
      ? { dot: 'bg-emerald-500', get label() { return t("Running"); }, bad: false }
      : { dot: 'bg-amber-500', get label() { return t("Not ready"); }, bad: false };
  }
  if (status.phase === 'pending') return { dot: 'bg-amber-500', get label() { return t("Pending"); }, bad: false };
  if (status.phase === 'failed') return { dot: 'bg-red-500', get label() { return t("Failed"); }, bad: true };
  if (status.phase === 'succeeded') return { dot: 'bg-muted-foreground', get label() { return t("Completed"); }, bad: false };
  return { dot: 'bg-muted-foreground', get label() { return t("Unknown"); }, bad: false };
}

export function PodStatusCell(props: PodStatusCellProps) {
  const visual = () => statusVisual(props.status);

  return (
    <div class="flex items-center gap-2">
      <span class={cn('size-2 shrink-0 rounded-full', visual().dot)} />
      <span class={cn('text-xs', visual().bad ? 'font-medium text-red-600' : 'text-foreground')}>{visual().label}</span>

      <Show when={props.status.restartCount > 0}>
        <Tooltip>
          <TooltipTrigger
            as="span"
            class="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground"
          >
            <RefreshCw class="size-3" />
            {props.status.restartCount}
          </TooltipTrigger>
          <TooltipContent>{t("Container restarts")}</TooltipContent>
        </Tooltip>
      </Show>

      <Show when={props.drift}>
        <Tooltip>
          <TooltipTrigger
            as="span"
            class="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
          >
            <AlertTriangle class="size-3" />{t("Drift")}</TooltipTrigger>
          <TooltipContent>{t("Pod is running, but its environment is marked ")}{props.dbStatus}{t(" in the database.")}</TooltipContent>
        </Tooltip>
      </Show>
    </div>
  );
}
