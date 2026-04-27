import { onCleanup, onMount, type Component, type ParentProps } from "solid-js"
import type { BaseRouterProps } from "@solidjs/router"
import { AppBaseProviders, AppInterface } from "@opencode-ai/app/app"
import { PlatformProvider } from "@opencode-ai/app/context/platform"
import { ServerConnection } from "@opencode-ai/app/context/server"
import { useLayout } from "@opencode-ai/app/context/layout"
import { useGlobalSDK } from "@opencode-ai/app/context/global-sdk"
import { useTheme } from "@opencode-ai/ui/theme/context"
import FileUpload from "~/components/file-upload"
import { platform } from "./platform"

function ForceLight(props: ParentProps) {
  const theme = useTheme()
  onMount(() => theme.setColorScheme("light"))
  return <>{props.children}</>
}

function HidePanels() {
  const layout = useLayout()
  onMount(() => layout.sidebar.close())
  return null
}

function PreviewAutoReload(props: { onReload: () => void }) {
  const globalSDK = useGlobalSDK()
  let timer: ReturnType<typeof setTimeout> | undefined
  const unsub = globalSDK.event.listen((e) => {
    if (e.details.type !== "session.idle") return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => props.onReload(), 1500)
  })
  onCleanup(() => {
    unsub()
    if (timer) clearTimeout(timer)
  })
  return null
}

export interface ProjectChatTabProps {
  projectId: string
  router: Component<BaseRouterProps>
  onPreviewReload: () => void
}

export default function ProjectChatTab(props: ProjectChatTabProps) {
  const tunnelUrl = `${window.location.origin}/api/proxy/${props.projectId}`
  const server: ServerConnection.Http = { type: "http", http: { url: tunnelUrl } }
  const serverKey = ServerConnection.Key.make(tunnelUrl)

  return (
    <>
      <PlatformProvider value={platform}>
        <AppBaseProviders>
          <ForceLight>
            <AppInterface
              defaultServer={serverKey}
              servers={[server]}
              router={props.router}
              disableHealthCheck
            >
              <HidePanels />
              <PreviewAutoReload onReload={props.onPreviewReload} />
            </AppInterface>
          </ForceLight>
        </AppBaseProviders>
      </PlatformProvider>
      <FileUpload projectId={props.projectId} />
    </>
  )
}
