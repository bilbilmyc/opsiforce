import { Show, onCleanup, type Component } from 'solid-js';
import type { BaseRouterProps } from '@solidjs/router';
import { AppBaseProviders, AppInterface } from '@opencode-ai/app/app';
import { PlatformProvider } from '@opencode-ai/app/context/platform';
import { ServerConnection } from '@opencode-ai/app/context/server';
import { useGlobalSDK } from '@opencode-ai/app/context/global-sdk';
import { useSyncProjectTitle } from '~/api/projects';
import FileUpload from '~/components/file-upload';
import { DictationButton } from '~/components/dictation-button';
import WorkspaceDownloadLinks from './workspace-download-links';
import OpencodeOverrides from './opencode-overrides';
import { platform } from './platform';

function OpenCodeEventBridge(props: { onReload: () => void; onTitle: (title: string) => void }) {
  const globalSDK = useGlobalSDK();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = globalSDK.event.listen((e) => {
    const event = e.details;
    if (event.type === 'session.idle') {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => props.onReload(), 1500);
      return;
    }
    if (event.type === 'session.updated' && !event.properties.info.parentID) {
      props.onTitle(event.properties.info.title);
    }
  });
  onCleanup(() => {
    unsub();
    if (timer) clearTimeout(timer);
  });
  return null;
}

export interface ProjectChatTabProps {
  projectId: string;
  environmentId: string;
  router: Component<BaseRouterProps>;
  currentTitle: string | null;
  onPreviewReload: () => void;
}

export function ProjectChatTab(props: ProjectChatTabProps) {
  const syncTitle = useSyncProjectTitle();
  const tunnelUrl = () => `${window.location.origin}/api/proxy/${props.environmentId}`;

  return (
    <>
      <Show when={tunnelUrl()} keyed>
        {(url) => {
          const server: ServerConnection.Http = { type: 'http', http: { url } };
          const serverKey = ServerConnection.Key.make(url);
          return (
            <PlatformProvider value={platform}>
              <AppBaseProviders>
                <AppInterface defaultServer={serverKey} servers={[server]} router={props.router} disableHealthCheck>
                  <OpencodeOverrides />
                  <OpenCodeEventBridge
                    onReload={props.onPreviewReload}
                    onTitle={(title) => syncTitle(props.projectId, title, props.currentTitle)}
                  />
                </AppInterface>
              </AppBaseProviders>
            </PlatformProvider>
          );
        }}
      </Show>
      <DictationButton projectId={props.projectId} environmentId={props.environmentId} />
      <FileUpload projectId={props.projectId} environmentId={props.environmentId} />
      <WorkspaceDownloadLinks projectId={props.projectId} environmentId={props.environmentId} />
    </>
  );
}
