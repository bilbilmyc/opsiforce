import { t } from '~/i18n';
import { Match, Switch } from 'solid-js';
import { FileDownloadCard } from './file-download-card';
import { createFileProbe, type FileFetchState, type FileMetadata } from './file-fetch';
import { FilePreviewNotice } from './file-preview-notice';

export interface FileUnsupportedPreviewProps {
  url: string;
  name: string;
  onDownload: () => void;
}

export function FileUnsupportedPreview(props: FileUnsupportedPreviewProps) {
  const probe = createFileProbe(() => props.url);

  return (
    <Switch
      fallback={
        <FileDownloadCard
          name={props.name}
          size={probedSize(probe())}
          detail={t("This format cannot be previewed.")}
          onDownload={props.onDownload}
        />
      }
    >
      <Match when={probe().status === 'loading'}>
        <FilePreviewNotice title={t("Opening preview…")} loading />
      </Match>
      <Match when={probe().status === 'missing'}>
        <FilePreviewNotice title={t("File not found")} detail={t("It may have been renamed, moved, or deleted.")} />
      </Match>
    </Switch>
  );
}

function probedSize(state: FileFetchState<FileMetadata>): number | undefined {
  return state.status === 'ready' ? state.value.size : undefined;
}
