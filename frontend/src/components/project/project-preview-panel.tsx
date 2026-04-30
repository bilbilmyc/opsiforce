import { Show, createSignal, onMount } from "solid-js"
import {
  Check,
  Copy,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
} from "~/components/icons"
import { ToolbarButton } from "~/components/ui/toolbar-button"
import { ResizeHandle } from "~/components/ui/resize-handle"
import { createResizablePanel } from "~/lib/create-resizable-panel"

export interface ProjectPreviewPanelProps {
  projectId: string
  appName?: string
  onReloadRef?: (reload: () => void) => void
}

export default function ProjectPreviewPanel(props: ProjectPreviewPanelProps) {
  const [open, setOpen] = createSignal(true)
  const [iframeLoading, setIframeLoading] = createSignal(true)
  const [copied, setCopied] = createSignal(false)

  const panel = createResizablePanel({
    storageKey: "opsiforce:preview-width",
    minWidth: 320,
    defaultWidth: () => Math.round(window.innerWidth * 0.4),
    maxWidth: () => window.innerWidth - 320,
    direction: "left",
  })

  const previewDomain = import.meta.env.VITE_WEBAPP_PREVIEW_DOMAIN
  const publicDomain = import.meta.env.VITE_WEBAPP_DOMAIN
  const previewUrl = `https://${props.projectId}.${previewDomain}/`
  const publicUrl = `https://${props.projectId}.${publicDomain}/`

  function reload() {
    const iframe = document.getElementById("webapp-preview") as HTMLIFrameElement | null
    if (!iframe) return
    setIframeLoading(true)
    iframe.src = iframe.src
  }

  function copyUrl() {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  onMount(() => props.onReloadRef?.(reload))

  return (
    <Show
      when={open()}
      fallback={
        <button
          onClick={() => setOpen(true)}
          class="shrink-0 w-8 bg-sidebar border-l border-border flex items-center justify-center hover:bg-accent transition-colors"
          title="Open preview"
        >
          <PanelRightOpen class="w-4 h-4 text-muted-foreground" />
        </button>
      }
    >
      <div
        class="shrink-0 border-l border-border flex flex-col bg-background relative"
        style={{ width: `${panel.width()}px` }}
      >
        <ResizeHandle
          onPointerDown={panel.startResize}
          resizing={panel.resizing()}
          position="left"
        />
        <div class="h-8 flex items-center justify-between px-1.5 bg-sidebar border-b border-border shrink-0">
          <div class="flex items-center gap-1">
            <ToolbarButton onClick={() => setOpen(false)} tooltip="Close preview">
              <PanelRightClose class="w-3.5 h-3.5" />
            </ToolbarButton>
            <span class="text-xs font-medium text-muted-foreground truncate">
              {props.appName || "Preview"}
            </span>
            <Show when={iframeLoading()}>
              <LoaderCircle class="w-3 h-3 text-muted-foreground animate-spin shrink-0" />
            </Show>
          </div>
          <div class="flex items-center">
            <ToolbarButton onClick={copyUrl} tooltip={copied() ? "Copied!" : "Copy URL"}>
              {copied() ? (
                <Check class="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy class="w-3.5 h-3.5" />
              )}
            </ToolbarButton>
            <ToolbarButton onClick={reload} tooltip="Reload preview">
              <RefreshCw class="w-3.5 h-3.5" />
            </ToolbarButton>
          </div>
        </div>
        <div class="flex-1 min-h-0">
          <iframe
            id="webapp-preview"
            src={previewUrl}
            class="w-full h-full border-0"
            allow="microphone; camera; clipboard-read; clipboard-write; geolocation; fullscreen; autoplay; display-capture; web-share"
            onLoad={() => setIframeLoading(false)}
            onError={() => setIframeLoading(false)}
          />
        </div>
      </div>
    </Show>
  )
}
