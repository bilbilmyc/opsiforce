import { createMemo, Show } from 'solid-js';
import type { ProjectOperation } from '~/api/client';
import { Copy, LoaderCircle } from '~/components/icons';
import StepProgress from '~/components/project/step-progress';
import { DUPLICATE_STEPS, duplicateStepIndex } from './duplicate-steps';

interface ProjectDuplicateProgressProps {
  operation: ProjectOperation;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export default function ProjectDuplicateProgress(props: ProjectDuplicateProgressProps) {
  const isFailed = () => props.operation.status === 'failed';
  const currentIndex = () => duplicateStepIndex(props.operation.status);

  const steps = createMemo(() =>
    DUPLICATE_STEPS.map((step) => {
      if (step.key === 'copying' && props.operation.bytesTotal > 0) {
        return {
          label: step.label,
          detail: `${formatBytes(props.operation.bytesCopied)} of ${formatBytes(props.operation.bytesTotal)}`,
        };
      }
      return { label: step.label, detail: step.detail };
    })
  );

  const title = () => (isFailed() ? 'Duplicate failed' : 'Duplicating project');

  return (
    <div class="h-full w-full flex items-center justify-center px-6">
      <div class="w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="h-9 w-9 shrink-0 rounded-md border border-border bg-muted/40 flex items-center justify-center">
            <Show when={isFailed()} fallback={<LoaderCircle class="h-4 w-4 animate-spin text-muted-foreground" />}>
              <Copy class="h-4 w-4 text-destructive" />
            </Show>
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-foreground">{title()}</div>
            <Show when={isFailed() && props.operation.error}>
              <div class="mt-0.5 text-xs text-destructive truncate">{props.operation.error}</div>
            </Show>
          </div>
        </div>

        <div class="mt-4">
          <StepProgress steps={steps()} currentIndex={currentIndex()} isFailed={isFailed()} isDone={false} />
        </div>
      </div>
    </div>
  );
}
