import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { federation } from '~/lib/federation';

interface RemoteComponentRuntimeProps {
  url: string;
  scope: string;
  module: string;
  type?: 'global' | 'esm';
}

export default function RemoteComponentRuntime(props: RemoteComponentRuntimeProps) {
  let containerRef: HTMLDivElement | undefined;
  let root: Root | undefined;
  const [errored, setErrored] = createSignal(false);

  onMount(async () => {
    try {
      if (!federation.moduleCache.has(props.scope)) {
        federation.registerRemotes(
          [
            {
              entry: props.url,
              name: props.scope,
              alias: props.scope,
              shareScope: 'default',
              type: props.type,
            },
          ],
          { force: true }
        );
      }

      const mod = (await federation.loadRemote(`${props.scope}/${props.module}`)) as {
        default: React.ComponentType;
      } | null;

      if (!containerRef || !mod?.default) {
        setErrored(true);
        return;
      }

      root = createRoot(containerRef);
      root.render(React.createElement(mod.default));
    } catch (error) {
      console.error('Failed to load remote module:', error);
      setErrored(true);
    }
  });

  onCleanup(() => {
    root?.unmount();
  });

  return (
    <Show
      when={!errored()}
      fallback={<div class="p-6 text-sm font-semibold text-destructive">Failed to load user management.</div>}
    >
      <div ref={containerRef} class="ms-app h-full w-full" />
    </Show>
  );
}
