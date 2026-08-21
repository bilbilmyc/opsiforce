import { Show, createSignal, onCleanup, onMount, untrack, type Component } from 'solid-js';
import { render } from 'solid-js/web';
import type { BaseRouterProps } from '@solidjs/router';
import { AppBaseProviders, AppInterface } from '@opencode-ai/app/app';
import { PlatformProvider } from '@opencode-ai/app/context/platform';
import { ServerConnection } from '@opencode-ai/app/context/server';
import { useGlobal } from '@opencode-ai/app/context/global';
import { useSyncProjectTitle } from '~/api/projects';
import { FileUpload } from '~/components/file-upload';
import { DictationButton } from '~/components/dictation-button';
import Spinner from '~/components/ui/spinner';
import { WorkspaceFileLinks } from './workspace-file-links';
import OpencodeOverrides from './opencode-overrides';
import { platform } from './platform';

function OpenCodeEventBridge(props: {
  server: ServerConnection.Any;
  onIdle: () => void;
  onTitle: (title: string) => void;
}) {
  const global = useGlobal();
  const sdk = untrack(() => global.ensureServerCtx(props.server).sdk);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = sdk.event.listen((e) => {
    const event = e.details;
    if (event.type === 'session.status' && event.properties.status.type === 'idle') {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => props.onIdle(), 1500);
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
  onAgentIdle: () => void;
  onPreviewFile: (path: string) => void;
}

export function ProjectChatTab(props: ProjectChatTabProps) {
  const syncTitle = useSyncProjectTitle();
  const url = untrack(() => `${window.location.origin}/api/proxy/${props.environmentId}`);
  const server: ServerConnection.Http = { type: 'http', http: { url } };
  const serverKey = ServerConnection.Key.make(url);
  const router = untrack(() => props.router);
  const onTitle = (title: string) => syncTitle(props.projectId, title, props.currentTitle);

  let embedHost!: HTMLDivElement;
  const [booting, setBooting] = createSignal(true);

  const coverBootUntilComposerPaints = () => {
    const composerPainted = () => !!embedHost.querySelector('[contenteditable="true"], textarea');
    const settle = () => {
      observer.disconnect();
      clearTimeout(maxTimer);
      requestAnimationFrame(() => requestAnimationFrame(() => setBooting(false)));
    };
    const check = () => {
      if (composerPainted()) settle();
    };
    const observer = new MutationObserver(check);
    observer.observe(embedHost, { childList: true, subtree: true });
    const maxTimer = setTimeout(settle, 15000);
    check();
    onCleanup(() => {
      observer.disconnect();
      clearTimeout(maxTimer);
    });
  };

  onMount(() => {
    let dispose: (() => void) | undefined;
    let disposed = false;
    const timer = setTimeout(() => {
      dispose = mountOpenCode();
      if (disposed) dispose();
    }, 0);
    coverBootUntilComposerPaints();
    onCleanup(() => {
      disposed = true;
      clearTimeout(timer);
      dispose?.();
    });
  });

  const mountOpenCode = () =>
    render(
      () => (
        <PlatformProvider value={platform}>
          <AppBaseProviders>
            <AppInterface
              defaultServer={serverKey}
              servers={[server]}
              router={router}
              disableHealthCheck
              serverScoped={<OpencodeOverrides />}
            >
              <OpenCodeEventBridge server={server} onIdle={() => props.onAgentIdle()} onTitle={onTitle} />
            </AppInterface>
          </AppBaseProviders>
        </PlatformProvider>
      ),
      embedHost,
    );

  return (
    <div class="relative flex-1 min-h-0 flex flex-col">
      <div ref={embedHost} class="contents" />
      <DictationButton projectId={props.projectId} environmentId={props.environmentId} />
      <FileUpload projectId={props.projectId} environmentId={props.environmentId} />
      <WorkspaceFileLinks
        projectId={props.projectId}
        environmentId={props.environmentId}
        onPreviewFile={props.onPreviewFile}
      />
      <Show when={booting()}>
        <Spinner label="Connecting..." overlay />
      </Show>
    </div>
  );
}
