import {
  Show,
  createSignal,
  createEffect,
  untrack,
  onMount,
  onCleanup,
  type Component,
  type ParentProps,
} from "solid-js";
import { createQuery, createMutation, useQueryClient } from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import { usePermissions } from "~/api/permissions";
import { Permission } from "~/constants/permissions";
import { MessageSquare, Code as CodeIcon, Ban } from "~/components/icons";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
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
import {
  api,
  ApiError,
  type OpenCodeSession,
  type Project,
} from "~/api/client";
import FileUpload from "~/components/file-upload";

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

export default function ProjectView(props: {
  projectId: string;
  initialPrompt?: string;
}) {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canViewCode = () => hasPermission(Permission.viewCodeTab);
  const canDisable = () => hasPermission(Permission.disableProject);

  const [router, setRouter] = createSignal<Component<BaseRouterProps> | null>(
    null,
  );
  const [activeTab, setActiveTab] = createSignal<"chat" | "code">("chat");
  const [codeTabOpened, setCodeTabOpened] = createSignal(false);
  const [previewOpen, setPreviewOpen] = createSignal(false);
  const [webappReady, setWebappReady] = createSignal(false);
  const [appName, setAppName] = createSignal<string | undefined>();
  const [userDismissed, setUserDismissed] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const qc = useQueryClient();

  const enableProject = createMutation(() => ({
    mutationFn: () => api.post<Project>(`/projects/${props.projectId}/enable`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  }));

  const project = createQuery(() => ({
    queryKey: ["projects", props.projectId],
    queryFn: () => api.get<Project>(`/projects/${props.projectId}`),
    refetchInterval: (query: {
      state: { data: Project | undefined; error: unknown };
    }) => {
      const { data, error } = query.state;
      if (error) return false;
      if (!data) return 3000;
      if (data.status === "disabled") return false;
      return data.status === "starting" || data.status === "suspended"
        ? 3000
        : false;
    },
  }));

  createEffect(() => {
    if (project.error instanceof ApiError && project.error.status === 404) {
      untrack(() => navigate({ to: "/" }));
    }
  });

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

    if (!latestSessionId && props.initialPrompt) {
      try {
        const newSession = await api.post<OpenCodeSession>(
          `/proxy/${props.projectId}/session`,
        );
        if (newSession?.id) {
          await api.post(
            `/proxy/${props.projectId}/session/${newSession.id}/prompt_async`,
            {
              parts: [{ type: "text", text: props.initialPrompt }],
            },
          );
          latestSessionId = newSession.id;
        }
      } catch {
        /* auto-send failed, proceed to empty session */
      }
    }

    setRouter(() => createDirectoryRouter(directory!, latestSessionId));
  }

  createEffect(() => {
    const status = project.data?.status;
    if (status === "disabled") return;
    if (status === "suspended") {
      fetch(`/api/proxy/${props.projectId}/ping`).catch(() => {});
    }
    if (status === "active" && !connecting) {
      connecting = true;
      connect();
    }
  });

  const webappDomain = import.meta.env.VITE_WEBAPP_DOMAIN || "localhost:3002";
  const webappProtocol = webappDomain.includes("localhost") ? "http" : "https";
  const webappUrl = () =>
    `${webappProtocol}://${props.projectId}.${webappDomain}/`;

  let statusInterval: ReturnType<typeof setInterval> | undefined;

  createEffect(() => {
    if (project.data?.status !== "active" || webappReady()) {
      if (statusInterval) clearInterval(statusInterval);
      return;
    }

    async function checkStatus() {
      try {
        const res = await fetch(
          `${webappProtocol}://${props.projectId}.${webappDomain}/api/app-meta`,
        );
        if (res.ok) {
          const data = (await res.json()) as {
            exists?: boolean;
            name?: string;
            description?: string;
          };
          if (data.exists) {
            setWebappReady(true);
            if (data.name) setAppName(data.name);
            if (!userDismissed()) setPreviewOpen(true);
            if (statusInterval) clearInterval(statusInterval);
          }
        }
      } catch {
        /* webapp not ready yet */
      }
    }

    checkStatus();
    statusInterval = setInterval(checkStatus, 5000);
  });

  onCleanup(() => {
    if (statusInterval) clearInterval(statusInterval);
  });

  function reloadPreview() {
    const iframe = document.getElementById(
      "webapp-preview",
    ) as HTMLIFrameElement;
    if (iframe) iframe.src = iframe.src;
  }

  function copyPreviewUrl() {
    navigator.clipboard.writeText(webappUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const vscodeDomain = import.meta.env.VITE_VSCODE_DOMAIN || "localhost:3003";
  const vscodeProtocol = vscodeDomain.includes("localhost") ? "http" : "https";
  const vscodeUrl = () =>
    `${vscodeProtocol}://${props.projectId}.${vscodeDomain}/?folder=/workspace`;

  return (
    <div class="h-full w-full flex flex-col overflow-hidden">
      {router() && canViewCode() && (
        <div class="h-9 flex items-center px-1 bg-background border-b border-border shrink-0">
          <Tabs
            value={activeTab()}
            onChange={(v) => {
              setActiveTab(v as "chat" | "code");
              if (v === "code") setCodeTabOpened(true);
            }}
            class="w-auto h-full"
          >
            <TabsList class="bg-transparent rounded-none p-0 h-full w-auto gap-0">
              <TabsTrigger
                value="chat"
                class="gap-1.5 px-3 h-full rounded-none border-b-2 border-transparent data-[selected]:border-foreground data-[selected]:bg-transparent data-[selected]:shadow-none text-muted-foreground data-[selected]:text-foreground hover:text-foreground/70 transition-colors"
              >
                <MessageSquare class="w-3.5 h-3.5" />
                <span class="text-xs font-medium">Chat</span>
              </TabsTrigger>
              <TabsTrigger
                value="code"
                class="gap-1.5 px-3 h-full rounded-none border-b-2 border-transparent data-[selected]:border-foreground data-[selected]:bg-transparent data-[selected]:shadow-none text-muted-foreground data-[selected]:text-foreground hover:text-foreground/70 transition-colors"
              >
                <CodeIcon class="w-3.5 h-3.5" />
                <span class="text-xs font-medium">Code</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      <div class="flex-1 min-h-0 flex">
        <div
          class="flex-1 min-w-0 flex flex-col oc-chat-only"
          style={{ display: activeTab() === "chat" ? "flex" : "none" }}
        >
          {project.data?.status === "disabled" ? (
            <div class="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Ban class="w-8 h-8" />
              <p class="text-sm font-medium">This project is disabled</p>
              <Show when={canDisable()}>
                <button
                  class="mt-1 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  disabled={enableProject.isPending}
                  onClick={() => enableProject.mutate(undefined as never)}
                >
                  {enableProject.isPending ? "Enabling..." : "Enable Project"}
                </button>
              </Show>
            </div>
          ) : router() ? (
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
          {router() && <FileUpload projectId={props.projectId} />}
        </div>

        {router() && codeTabOpened() && canViewCode() && (
          <div
            class="flex-1 min-w-0 flex flex-col"
            style={{ display: activeTab() === "code" ? "flex" : "none" }}
          >
            <iframe
              src={vscodeUrl()}
              class="flex-1 w-full border-0"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        )}

        {!previewOpen() && webappReady() && (
          <button
            onClick={() => {
              setPreviewOpen(true);
              setUserDismissed(false);
            }}
            class="shrink-0 w-8 bg-sidebar border-l border-border flex items-center justify-center hover:bg-accent transition-colors"
            title="Open preview"
          >
            <svg
              class="w-4 h-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        )}

        {previewOpen() && (
          <div class="w-2/5 shrink-0 border-l border-border flex flex-col bg-background">
            <div class="h-8 flex items-center justify-between px-2 bg-sidebar border-b border-border shrink-0">
              <div class="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setPreviewOpen(false);
                    setUserDismissed(true);
                  }}
                  class="w-6 h-6 flex items-center justify-center rounded hover:bg-accent transition-colors"
                  title="Close preview"
                >
                  <svg
                    class="w-3.5 h-3.5 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
                <span class="text-xs font-medium text-muted-foreground">
                  {appName() || "Preview"}
                </span>
              </div>
              <div class="flex items-center gap-1">
                <button
                  onClick={copyPreviewUrl}
                  class="h-6 px-2 flex items-center gap-1 rounded hover:bg-accent transition-colors text-xs text-muted-foreground"
                  title="Copy preview URL"
                >
                  <svg
                    class="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d={
                        copied()
                          ? "M5 13l4 4L19 7"
                          : "M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10"
                      }
                    />
                  </svg>
                  {copied() ? "Copied" : "URL"}
                </button>
                <button
                  onClick={reloadPreview}
                  class="h-6 px-2 flex items-center gap-1 rounded hover:bg-accent transition-colors text-xs text-muted-foreground"
                  title="Reload preview"
                >
                  <svg
                    class="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Reload
                </button>
              </div>
            </div>
            <iframe
              id="webapp-preview"
              src={webappUrl()}
              class="flex-1 w-full border-0"
              allow="microphone; camera; clipboard-read; clipboard-write; geolocation; fullscreen; autoplay; display-capture; web-share"
            />
          </div>
        )}
      </div>
    </div>
  );
}
