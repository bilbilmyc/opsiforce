import { Show } from 'solid-js';
import { LoaderCircle } from '~/components/icons';

export interface FilePreviewNoticeProps {
  title: string;
  detail?: string;
  loading?: boolean;
}

export function FilePreviewNotice(props: FilePreviewNoticeProps) {
  return (
    <div class="h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
      <Show when={props.loading}>
        <LoaderCircle class="w-4 h-4 text-muted-foreground animate-spin" />
      </Show>
      <div class="text-sm font-medium text-foreground">{props.title}</div>
      <Show when={props.detail}>
        <p class="text-xs text-muted-foreground max-w-xs">{props.detail}</p>
      </Show>
    </div>
  );
}
