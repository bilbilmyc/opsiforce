import {
  createSignal,
  createEffect,
  onMount,
  type Component,
  type ParentProps,
} from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { AppBaseProviders, AppInterface } from "@opencode-ai/app/app";
import {
  PlatformProvider,
  type Platform,
} from "@opencode-ai/app/context/platform";
import { ServerConnection } from "@opencode-ai/app/context/server";
import { useTheme } from "@opencode-ai/ui/theme/context";
import { useLayout } from "@opencode-ai/app/context/layout";
import {
  MemoryRouter,
  createMemoryHistory,
  type BaseRouterProps,
} from "@solidjs/router";
import { base64Encode } from "@opencode-ai/util/encode";
import { api, type OpenCodeSession, type Project } from "~/api/client";

const platform: Platform = {
  platform: "web",
  version: "0.1.0",
  openLink: (url: string) => window.open(url, "_blank"),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  restart: async () => window.location.reload(),
  notify: async () => {},
};

function ForceLight(props: ParentProps) {
  const theme = useTheme();
  onMount(() => theme.setColorScheme("light"));
  return <>{props.children}</>;
}

function HidePanels() {
  const layout = useLayout();
  onMount(() => {
    layout.sidebar.close();
  });
  return null;
}

function createDirectoryRouter(
  directory: string,
  sessionId?: string,
): Component<BaseRouterProps> {
  const encoded = base64Encode(directory);
  const initialPath = sessionId
    ? `/${encoded}/session/${sessionId}`
    : `/${encoded}/session`;

  return (props) => {
    const history = createMemoryHistory();
    history.set({ value: initialPath });

    return (
      <MemoryRouter root={props.root} history={history}>
        {props.children}
      </MemoryRouter>
    );
  };
}

export default function ProjectView(props: { projectId: string }) {
  const [router, setRouter] = createSignal<Component<BaseRouterProps> | null>(
    null,
  );
  const qc = useQueryClient();

  const project = createQuery(() => ({
    queryKey: ["projects", props.projectId],
    queryFn: () => api.get<Project>(`/projects/${props.projectId}`),
    refetchInterval: (query: { state: { data: Project | undefined } }) => {
      const data = query.state.data;
      if (!data) return 3000;
      return data.status === "pending" ? 3000 : false;
    },
  }));

  const tunnelUrl = () =>
    `${window.location.origin}/api/proxy/${props.projectId}`;

  const server = (): ServerConnection.Http => ({
    type: "http",
    http: { url: tunnelUrl() },
  });

  const serverKey = () => ServerConnection.Key.make(tunnelUrl());

  let connecting = false;
  let titleSynced = false;

  function syncTitle(title: string | undefined) {
    if (titleSynced || !title || project.data?.title) return;
    titleSynced = true;
    api
      .patch(`/projects/${props.projectId}`, { title })
      .then(() => qc.invalidateQueries({ queryKey: ["projects"] }));
  }

  async function connect() {
    const proxyBase = `/api/proxy/${props.projectId}`;

    let directory: string | undefined;
    try {
      const pathRes = await fetch(`${proxyBase}/path`);
      if (pathRes.ok) {
        const pathData = (await pathRes.json()) as { directory?: string };
        directory = pathData.directory;
      }
    } catch {
      /* proxy may not be routed yet */
    }
    if (!directory) {
      connecting = false;
      return;
    }

    let latestSessionId: string | undefined;
    try {
      const sessions = await api.get<OpenCodeSession[]>(
        `/proxy/${props.projectId}/session`,
      );

      if (Array.isArray(sessions) && sessions.length > 0) {
        const sorted = sessions
          .filter((s) => !s.parentID)
          .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
        if (sorted.length > 0) {
          latestSessionId = sorted[0].id;
          syncTitle(sorted[0].title);
        }
      }
    } catch {
      /* no sessions yet */
    }

    setRouter(() => createDirectoryRouter(directory!, latestSessionId));
  }

  createEffect(() => {
    const status = project.data?.status;
    if (status === "active" && !connecting) {
      connecting = true;
      connect();
    }
  });


  return (
    <div class="h-full w-full flex flex-col overflow-hidden">
      <div class="flex-1 min-h-0 flex">
        <div class="flex-1 min-w-0 flex flex-col oc-chat-only">
          {router() ? (
            <PlatformProvider value={platform}>
              <AppBaseProviders>
                <ForceLight>
                  <AppInterface
                    defaultServer={serverKey()}
                    servers={[server()]}
                    router={router()!}
                    disableHealthCheck
                  >
                    <HidePanels />
                  </AppInterface>
                </ForceLight>
              </AppBaseProviders>
            </PlatformProvider>
          ) : (
            <div class="flex items-center justify-center h-full gap-2 text-muted-foreground">
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                />
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span class="text-sm">Connecting...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
