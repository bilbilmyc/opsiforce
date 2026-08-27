import { Show } from 'solid-js';
import { Download, RefreshCw } from '~/components/icons';
import { Button } from '~/components/ui/button';
import { formatBytes } from '~/lib/format-bytes';
import { FileTypeBadge } from '~/components/project/files/file-type-badge';

export interface FileDownloadCardProps {
  name: string;
  size?: number;
  detail?: string;
  onDownload: () => void;
  onRetry?: () => void;
}

export function FileDownloadCard(props: FileDownloadCardProps) {
  return (
    <div class="h-full flex items-center justify-center p-6">
      <div class="w-full max-w-xs flex flex-col items-center gap-3 rounded-xl border border-border bg-background p-5 text-center">
        <FileTypeBadge name={props.name} type="file" class="w-12 h-12 text-xs" />
        <div class="w-full min-w-0">
          <div class="text-sm font-medium truncate" title={props.name}>
            {props.name}
          </div>
          <Show when={props.size !== undefined}>
            <div class="text-xs text-muted-foreground">{formatBytes(props.size ?? 0)}</div>
          </Show>
        </div>
        <Show when={props.detail}>
          <p class="text-xs text-muted-foreground">{props.detail}</p>
        </Show>
        <div class="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={props.onDownload}>
            <Download class="w-3.5 h-3.5" />
            Download
          </Button>
          <Show when={props.onRetry}>
            {(retry) => (
              <Button size="sm" variant="ghost" onClick={retry()}>
                <RefreshCw class="w-3.5 h-3.5" />
                Try again
              </Button>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}
