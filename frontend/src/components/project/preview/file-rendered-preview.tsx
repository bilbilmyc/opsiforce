import { Match, Switch, createEffect, createSignal, on } from 'solid-js';
import { createFileProbe } from './file-fetch';
import { FilePreviewNotice } from './file-preview-notice';

export interface FileRenderedPreviewProps {
  url: string;
  name: string;
  pdf: boolean;
}

export function FileRenderedPreview(props: FileRenderedPreviewProps) {
  const probe = createFileProbe(() => props.url);
  const [imageFailed, setImageFailed] = createSignal(false);

  createEffect(
    on(
      () => props.url,
      () => setImageFailed(false)
    )
  );

  return (
    <Switch>
      <Match when={probe().status === 'loading'}>
        <FilePreviewNotice title="Opening preview…" loading />
      </Match>
      <Match when={probe().status === 'missing'}>
        <FilePreviewNotice title="File not found" detail="It may have been renamed, moved, or deleted." />
      </Match>
      <Match when={probe().status === 'error' || imageFailed()}>
        <FilePreviewNotice title="Could not load this file" detail="Try again, or download it instead." />
      </Match>
      <Match when={probe().status === 'ready' && props.pdf}>
        <iframe src={props.url} title={props.name} class="w-full h-full border-0" />
      </Match>
      <Match when={probe().status === 'ready'}>
        <div class="h-full overflow-auto flex items-center justify-center p-4">
          <img
            src={props.url}
            alt={props.name}
            class="max-w-full max-h-full object-contain"
            onError={() => setImageFailed(true)}
          />
        </div>
      </Match>
    </Switch>
  );
}
