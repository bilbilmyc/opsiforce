import { Show } from 'solid-js';
import { Check, X } from '~/components/icons';
import type { PublishJob } from '~/api/publish';
import StepProgress from '~/components/project/step-progress';
import { PUBLISH_STEPS, publishStepIndex } from './publish-steps';

export interface PublishProgressProps {
  job: PublishJob;
  environmentName: string;
}

export default function PublishProgress(props: PublishProgressProps) {
  const isFailed = () => props.job.status === 'failed';
  const isDone = () => props.job.status === 'done';
  const currentIndex = () => publishStepIndex(props.job.status);

  return (
    <div class="mt-4">
      <Show
        when={isDone()}
        fallback={
          <Show when={isFailed()}>
            <div class="mb-4 flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5">
              <X class="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <div class="min-w-0 text-xs text-foreground">
                <p class="font-medium text-destructive">Publish failed</p>
                <Show when={props.job.error}>
                  <p class="mt-0.5 break-words text-muted-foreground">{props.job.error}</p>
                </Show>
              </div>
            </div>
          </Show>
        }
      >
        <div class="mb-4 flex items-start gap-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
          <Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <div class="min-w-0 text-xs text-foreground">
            <p class="font-medium text-emerald-700">{props.environmentName} is live</p>
            <p class="mt-0.5 text-muted-foreground">Your app is now running the latest version.</p>
          </div>
        </div>
      </Show>

      <StepProgress steps={PUBLISH_STEPS} currentIndex={currentIndex()} isFailed={isFailed()} isDone={isDone()} />
    </div>
  );
}
