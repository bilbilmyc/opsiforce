import type { Component } from "solid-js"
import {
  MemoryRouter,
  createMemoryHistory,
  type BaseRouterProps,
} from "@solidjs/router"
import { type Platform } from "@opencode-ai/app/context/platform"
import { base64Encode } from "@opencode-ai/util/encode"

export const platform: Platform = {
  platform: "web",
  version: "0.1.0",
  openLink: (url: string) => window.open(url, "_blank"),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  restart: async () => window.location.reload(),
  notify: async () => {},
}

export function createDirectoryRouter(
  directory: string,
  sessionId?: string,
): Component<BaseRouterProps> {
  const encoded = base64Encode(directory)
  const initialPath = sessionId
    ? `/${encoded}/session/${sessionId}`
    : `/${encoded}/session`

  return (props) => {
    const history = createMemoryHistory()
    history.set({ value: initialPath })

    return (
      <MemoryRouter root={props.root} history={history}>
        {props.children}
      </MemoryRouter>
    )
  }
}
