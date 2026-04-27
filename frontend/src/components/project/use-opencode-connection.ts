import {
  createEffect,
  createSignal,
  type Accessor,
  type Component,
} from "solid-js"
import { useQueryClient } from "@tanstack/solid-query"
import type { BaseRouterProps } from "@solidjs/router"
import {
  api,
  type OpenCodeSession,
  type ProjectStatus,
} from "~/api/client"
import { projectKeys } from "~/api/projects"
import { createDirectoryRouter } from "./platform"

export interface OpenCodeConnectionOptions {
  projectId: string
  status: Accessor<ProjectStatus | undefined>
  initialPrompt?: string
}

export function useOpenCodeConnection(options: OpenCodeConnectionOptions) {
  const qc = useQueryClient()
  const [router, setRouter] = createSignal<Component<BaseRouterProps> | null>(null)

  let connecting = false
  let titleSynced = false
  let prevStatus: ProjectStatus | undefined

  function syncTitle(title: string | undefined) {
    if (titleSynced || !title) return
    titleSynced = true
    api
      .patch(`/projects/${options.projectId}`, { title })
      .then(() => qc.invalidateQueries({ queryKey: projectKeys.all }))
  }

  async function resolveDirectory(): Promise<string | undefined> {
    try {
      const res = await fetch(`/api/proxy/${options.projectId}/path`)
      if (!res.ok) return undefined
      const payload = (await res.json()) as { directory?: string }
      return payload.directory
    } catch {
      return undefined
    }
  }

  async function resolveLatestSessionId(): Promise<string | undefined> {
    try {
      const sessions = await api.get<OpenCodeSession[]>(
        `/proxy/${options.projectId}/session`,
      )
      if (!Array.isArray(sessions) || sessions.length === 0) return undefined
      const sorted = sessions
        .filter((s) => !s.parentID)
        .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
      const head = sorted[0]
      if (!head) return undefined
      syncTitle(head.title)
      return head.id
    } catch {
      return undefined
    }
  }

  async function startFromInitialPrompt(): Promise<string | undefined> {
    if (!options.initialPrompt) return undefined
    try {
      const session = await api.post<OpenCodeSession>(
        `/proxy/${options.projectId}/session`,
      )
      if (!session?.id) return undefined
      await api.post(
        `/proxy/${options.projectId}/session/${session.id}/prompt_async`,
        { parts: [{ type: "text", text: options.initialPrompt }] },
      )
      return session.id
    } catch {
      return undefined
    }
  }

  async function connect() {
    const directory = await resolveDirectory()
    if (!directory) {
      connecting = false
      return
    }
    const existingSessionId = await resolveLatestSessionId()
    const sessionId = existingSessionId ?? (await startFromInitialPrompt())
    setRouter(() => createDirectoryRouter(directory, sessionId))
  }

  function reset() {
    setRouter(null)
    connecting = false
    titleSynced = false
  }

  createEffect(() => {
    const status = options.status()
    if (!status) return

    if (status === "disabled") {
      reset()
      prevStatus = status
      return
    }

    if (status === "starting" && prevStatus && prevStatus !== "starting") {
      reset()
    }

    if (status === "active" && !connecting) {
      connecting = true
      connect()
    }

    prevStatus = status
  })

  return { router, reset }
}
