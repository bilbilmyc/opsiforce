import { Match, Show, Switch, type JSX } from 'solid-js';
import { Download, ExternalLink, X } from '~/components/icons';
import { ToolbarButton } from '~/components/ui/toolbar-button';
import { downloadFile, fileContentUrl } from '~/api/files';
import { FileCsvPreview } from './file-csv-preview';
import { FileHtmlPreview } from './file-html-preview';
import { FileOfficePreview } from './file-office-preview';
import { FileRenderedPreview } from './file-rendered-preview';
import { FileTextPreview } from './file-text-preview';
import { FileUnsupportedPreview } from './file-unsupported-preview';
import { FileXlsxPreview } from './file-xlsx-preview';
import { fileNameOf, filePreviewKind, opensInNewTab } from './file-preview-format';

export interface FilePreviewPaneProps {
  projectId: string;
  environmentId: string;
  path: string;
  switcher?: JSX.Element;
  onClose: () => void;
}

export function FilePreviewPane(props: FilePreviewPaneProps) {
  const name = () => fileNameOf(props.path);
  const kind = () => filePreviewKind(name());
  const url = () => fileContentUrl(props.projectId, props.environmentId, props.path);
  const download = () => downloadFile(props.projectId, props.environmentId, { name: name(), path: props.path });

  return (
    <>
      <div class="h-8 flex items-center gap-2 px-1.5 bg-sidebar border-b border-border shrink-0">
        <span class="flex-1 min-w-0 text-xs font-medium text-muted-foreground truncate" title={props.path}>
          {name()}
        </span>
        {props.switcher}
        <div class="flex items-center shrink-0">
          <ToolbarButton onClick={download} tooltip="Download">
            <Download class="w-3.5 h-3.5" />
          </ToolbarButton>
          <Show when={opensInNewTab(kind())}>
            <ToolbarButton onClick={() => window.open(url(), '_blank', 'noopener')} tooltip="Open in new tab">
              <ExternalLink class="w-3.5 h-3.5" />
            </ToolbarButton>
          </Show>
          <ToolbarButton onClick={props.onClose} tooltip="Close file">
            <X class="w-3.5 h-3.5" />
          </ToolbarButton>
        </div>
      </div>
      <div class="flex-1 min-h-0">
        <Switch>
          <Match when={kind() === 'unsupported'}>
            <FileUnsupportedPreview url={url()} name={name()} onDownload={download} />
          </Match>
          <Match when={kind() === 'markdown' || kind() === 'text'}>
            <FileTextPreview url={url()} name={name()} markdown={kind() === 'markdown'} onDownload={download} />
          </Match>
          <Match when={kind() === 'pdf' || kind() === 'image' || kind() === 'svg'}>
            <FileRenderedPreview url={url()} name={name()} pdf={kind() === 'pdf'} />
          </Match>
          <Match when={kind() === 'html'}>
            <FileHtmlPreview url={url()} name={name()} />
          </Match>
          <Match when={kind() === 'csv'}>
            <FileCsvPreview url={url()} name={name()} onDownload={download} />
          </Match>
          <Match when={kind() === 'office'}>
            <FileOfficePreview
              projectId={props.projectId}
              environmentId={props.environmentId}
              path={props.path}
              name={name()}
              onDownload={download}
            />
          </Match>
          <Match when={kind() === 'spreadsheet'}>
            <FileXlsxPreview url={url()} name={name()} onDownload={download} />
          </Match>
        </Switch>
      </div>
    </>
  );
}
