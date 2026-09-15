import { t } from '~/i18n';
import { Match, Switch } from 'solid-js';
import { createFileProbe } from './file-fetch';
import { FilePreviewNotice } from './file-preview-notice';

export interface FileHtmlPreviewProps {
  url: string;
  name: string;
}

export function FileHtmlPreview(props: FileHtmlPreviewProps) {
  const probe = createFileProbe(() => props.url);

  return (
    <Switch>
      <Match when={probe().status === 'loading'}>
        <FilePreviewNotice title={t("Opening preview…")} loading />
      </Match>
      <Match when={probe().status === 'missing'}>
        <FilePreviewNotice title={t("File not found")} detail={t("It may have been renamed, moved, or deleted.")} />
      </Match>
      <Match when={probe().status === 'error'}>
        <FilePreviewNotice title={t("Could not load this file")} detail={t("Try again, or download it instead.")} />
      </Match>
      <Match when={probe().status === 'ready'}>
        <iframe
          src={props.url}
          title={props.name}
          class="w-full h-full border-0 bg-white"
          sandbox="allow-scripts"
          referrerpolicy="no-referrer"
        />
      </Match>
    </Switch>
  );
}
