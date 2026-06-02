import { createRenderEffect, onMount, untrack } from "solid-js"
import { useTheme } from "@opencode-ai/ui/theme/context"
import { useLayout } from "@opencode-ai/app/context/layout"
import { useSettings } from "@opencode-ai/app/context/settings"

export default function OpencodeOverrides() {
  const theme = useTheme()
  const layout = useLayout()
  const settings = useSettings()

  createRenderEffect(() => {
    untrack(() => {
      layout.fileTree.close()
      layout.view("").reviewPanel.close()
    })
  })

  onMount(() => {
    theme.setColorScheme("light")
    layout.sidebar.close()

    settings.general.setShellToolPartsExpanded(false)
    settings.general.setEditToolPartsExpanded(false)
  })

  return null
}
