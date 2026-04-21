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
import {
  createQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import { usePermissions } from "~/api/permissions";
import { Permission } from "~/constants/permissions";
import {
  MessageSquare,
  Code as CodeIcon,
  Database,
  Ban,
  PanelRightOpen,
  PanelRightClose,
  Copy,
  Check,
  RefreshCw,
} from "~/components/icons";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import ProjectActionsMenu from "~/components/project-actions-menu";
import { AppBaseProviders, AppInterface } from "@opencode-ai/app/app";
import {
  PlatformProvider,
  type Platform,
} from "@opencode-ai/app/context/platform";
import { ServerConnection } from "@opencode-ai/app/context/server";
import { useTheme } from "@opencode-ai/ui/theme/context";
import { useLayout } from "@opencode-ai/app/context/layout";
import { useGlobalSDK } from "@opencode-ai/app/context/global-sdk";
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
import Spinner from "~/components/ui/spinner";
import { createResizablePanel } from "~/lib/create-resizable-panel";
import { ResizeHandle } from "~/components/ui/resize-handle";
import { Button } from "~/components/ui/button";
import { ToolbarButton } from "~/components/ui/toolbar-button";

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

function PreviewAutoReload(props: { onReload: () => void }) {
  const globalSDK = useGlobalSDK();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = globalSDK.event.listen((e) => {
    if (e.details.type !== "session.idle") return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => props.onReload(), 1500);
  });
  onCleanup(() => {
    unsub();
    if (timer) clearTimeout(timer);
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
  const canViewDb = () => hasPermission(Permission.viewDbTab);
  const canDisable = () => hasPermission(Permission.disableProject);

  const [router, setRouter] = createSignal<Component<BaseRouterProps> | null>(
    null,
  );
  const [activeTab, setActiveTab] = createSignal<"chat" | "code" | "db">(
    "chat",
  );
  const [codeTabOpened, setCodeTabOpened] = createSignal(false);
  const [dbTabOpened, setDbTabOpened] = createSignal(false);
  const [codeTabLoading, setCodeTabLoading] = createSignal(true);
  const [dbTabLoading, setDbTabLoading] = createSignal(true);
  const [previewLoading, setPreviewLoading] = createSignal(true);
  const [previewOpen, setPreviewOpen] = createSignal(false);
  const [webappReady, setWebappReady] = createSignal(false);
  const [appName, setAppName] = createSignal<string | undefined>();
  const [userDismissed, setUserDismissed] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const qc = useQueryClient();

  const preview = createResizablePanel({
    storageKey: "opsiforce:preview-width",
    minWidth: 320,
    defaultWidth: () => Math.round(window.innerWidth * 0.4),
    maxWidth: () => window.innerWidth - 320,
    direction: "left",
  });

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

  async function checkWebappStatus() {
    if (webappReady()) return;
    try {
      const data = await api.get<{
        exists?: boolean;
        name?: string;
        description?: string;
      }>(`/projects/${props.projectId}/app-meta`);
      if (data.exists) {
        setWebappReady(true);
        if (data.name) setAppName(data.name);
        if (!userDismissed()) setPreviewOpen(true);
      }
    } catch {
      /* webapp not ready yet */
    }
  }

  createEffect(() => {
    if (project.data?.status === "active" && !webappReady()) {
      checkWebappStatus();
    }
  });

  function reloadPreview() {
    checkWebappStatus();
    const iframe = document.getElementById(
      "webapp-preview",
    ) as HTMLIFrameElement;
    if (iframe) {
      setPreviewLoading(true);
      iframe.src = iframe.src;
    }
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

  const dbDomain = import.meta.env.VITE_DB_DOMAIN || "localhost:3004";
  const dbProtocol = dbDomain.includes("localhost") ? "http" : "https";
  const dbUrl = () => `${dbProtocol}://${props.projectId}.${dbDomain}/`;

  return (
    <div class="h-full w-full flex flex-col overflow-hidden">
      <Show when={project.data}>
        <div class="flex items-center justify-between px-3 py-2 bg-background border-b border-border shrink-0">
          <div class="flex items-center">
            <Show when={router() && (canViewCode() || canViewDb())}>
              <Tabs
                value={activeTab()}
                onChange={(v) => {
                  setActiveTab(v as "chat" | "code" | "db");
                  if (v === "code") setCodeTabOpened(true);
                  if (v === "db") setDbTabOpened(true);
                }}
                class="w-auto"
              >
                <TabsList class="w-auto">
                  <TabsTrigger value="chat" class="flex-none gap-1.5">
                    <MessageSquare class="w-3.5 h-3.5" />
                    Chat
                  </TabsTrigger>
                  <Show when={canViewCode()}>
                    <TabsTrigger value="code" class="flex-none gap-1.5">
                      <CodeIcon class="w-3.5 h-3.5" />
                      Code
                    </TabsTrigger>
                  </Show>
                  <Show when={canViewDb()}>
                    <TabsTrigger value="db" class="flex-none gap-1.5">
                      <Database class="w-3.5 h-3.5" />
                      DB
                    </TabsTrigger>
                  </Show>
                </TabsList>
              </Tabs>
            </Show>
          </div>
          <ProjectActionsMenu
            projectId={props.projectId}
            status={project.data!.status}
            workspaceId={project.data!.workspaceId}
            onDeleted={() => navigate({ to: "/" })}
            onDuplicated={(p) =>
              navigate({
                to: "/projects/$projectId",
                params: { projectId: p.id },
                search: { prompt: undefined },
              })
            }
          />
        </div>
      </Show>

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
                <Button
                  size="sm"
                  class="mt-1"
                  disabled={enableProject.isPending}
                  onClick={() => enableProject.mutate(undefined as never)}
                >
                  {enableProject.isPending ? "Enabling..." : "Enable Project"}
                </Button>
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
                    <PreviewAutoReload onReload={reloadPreview} />
                  </AppInterface>
                </ForceLight>
              </AppBaseProviders>
            </PlatformProvider>
          ) : (
            <Spinner label="Connecting..." />
          )}
          {router() && <FileUpload projectId={props.projectId} />}
        </div>

        {router() && codeTabOpened() && canViewCode() && (
          <div
            class="flex-1 min-w-0 flex flex-col relative"
            style={{ display: activeTab() === "code" ? "flex" : "none" }}
          >
            <Show when={codeTabLoading()}>
              <div class="absolute inset-0 bg-background z-10">
                <Spinner label="Loading editor..." />
              </div>
            </Show>
            <iframe
              src={vscodeUrl()}
              class="flex-1 w-full border-0"
              allow="clipboard-read; clipboard-write"
              onLoad={() => setCodeTabLoading(false)}
            />
          </div>
        )}

        {router() && dbTabOpened() && canViewDb() && (
          <div
            class="flex-1 min-w-0 flex flex-col relative"
            style={{ display: activeTab() === "db" ? "flex" : "none" }}
          >
            <Show when={dbTabLoading()}>
              <div class="absolute inset-0 bg-background z-10">
                <Spinner label="Loading database viewer..." />
              </div>
            </Show>
            <iframe
              src={dbUrl()}
              class="flex-1 w-full border-0"
              allow="clipboard-read; clipboard-write"
              onLoad={() => setDbTabLoading(false)}
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
            <PanelRightOpen class="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        {previewOpen() && (
          <div
            class="shrink-0 border-l border-border flex flex-col bg-background relative"
            style={{ width: `${preview.width()}px` }}
          >
            <ResizeHandle
              onPointerDown={preview.startResize}
              resizing={preview.resizing()}
              position="left"
            />
            <div class="h-8 flex items-center justify-between px-1.5 bg-sidebar border-b border-border shrink-0">
              <div class="flex items-center gap-1">
                <ToolbarButton
                  onClick={() => {
                    setPreviewOpen(false);
                    setUserDismissed(true);
                  }}
                  tooltip="Close preview"
                >
                  <PanelRightClose class="w-3.5 h-3.5" />
                </ToolbarButton>
                <span class="text-xs font-medium text-muted-foreground truncate">
                  {appName() || "Preview"}
                </span>
              </div>
              <div class="flex items-center">
                <ToolbarButton
                  onClick={copyPreviewUrl}
                  tooltip={copied() ? "Copied!" : "Copy URL"}
                >
                  {copied() ? (
                    <Check class="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy class="w-3.5 h-3.5" />
                  )}
                </ToolbarButton>
                <ToolbarButton
                  onClick={reloadPreview}
                  tooltip="Reload preview"
                >
                  <RefreshCw class="w-3.5 h-3.5" />
                </ToolbarButton>
              </div>
            </div>
            <div class="flex-1 min-h-0 relative">
              <Show when={previewLoading()}>
                <div class="absolute inset-0 bg-background z-10">
                  <Spinner label="Loading preview..." />
                </div>
              </Show>
              <iframe
                id="webapp-preview"
                src={webappUrl()}
                class="w-full h-full border-0"
                allow="microphone; camera; clipboard-read; clipboard-write; geolocation; fullscreen; autoplay; display-capture; web-share"
                onLoad={() => setPreviewLoading(false)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
