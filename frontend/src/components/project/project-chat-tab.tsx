import { Show, onCleanup, untrack, type Component } from 'solid-js';
import type { BaseRouterProps } from '@solidjs/router';
import { AppBaseProviders, AppInterface } from '@opencode-ai/app/app';
import { PlatformProvider } from '@opencode-ai/app/context/platform';
import { ServerConnection } from '@opencode-ai/app/context/server';
import { useGlobal } from '@opencode-ai/app/context/global';
import { useSyncProjectTitle } from '~/api/projects';
import FileUpload from '~/components/file-upload';
import { DictationButton } from '~/components/dictation-button';
import WorkspaceDownloadLinks from './workspace-download-links';
import OpencodeOverrides from './opencode-overrides';
import { platform } from './platform';

function OpenCodeEventBridge(props: {
  server: ServerConnection.Any;
  onReload: () => void;
  onTitle: (title: string) => void;
}) {
  // useServerSDK() is only provided under the route-level SelectedServerProviders,
  // which this bridge sits above. Resolve the same SDK the way that context does.
  // The connection is keyed by URL one level up, so this component is recreated
  // rather than updated when it changes — read it untracked.
  const global = useGlobal();
  const sdk = untrack(() => global.ensureServerCtx(props.server).sdk);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = sdk.event.listen((e) => {
    const event = e.details;
    if (event.type === 'session.status' && event.properties.status.type === 'idle') {
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
                <AppInterface
                  defaultServer={serverKey}
                  servers={[server]}
                  router={props.router}
                  disableHealthCheck
                  // OpencodeOverrides needs the Layout/Models providers, which upstream
                  // mounts server-scoped (below AppInterface's children). serverScoped is
                  // the slot rendered inside them.
                  serverScoped={<OpencodeOverrides />}
                >
                  <OpenCodeEventBridge
                    server={server}
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
