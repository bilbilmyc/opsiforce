import {
  createEffect,
  createSignal,
  type Accessor,
  type Component,
} from "solid-js"
import type { BaseRouterProps } from "@solidjs/router"
import {
  api,
  type OpenCodeSession,
  type ProjectStatus,
} from "~/api/client"
import { useSyncProjectTitle } from "~/api/projects"
import { createDirectoryRouter } from "./platform"

export interface OpenCodeConnectionOptions {
  projectId: string
  environmentId: Accessor<string>
  status: Accessor<ProjectStatus | undefined>
  rememberedSessionId: Accessor<string | null | undefined>
  currentTitle: Accessor<string | null | undefined>
  onResolveSession: (environmentId: string, sessionId: string) => void
  initialPrompt?: string
}

export function useOpenCodeConnection(options: OpenCodeConnectionOptions) {
  const [router, setRouter] = createSignal<Component<BaseRouterProps> | null>(null)
  const syncProjectTitle = useSyncProjectTitle()

  let connecting = false
  let prevStatus: ProjectStatus | undefined
  let prevEnvId: string | undefined

  const syncTitle = (title: string) => syncProjectTitle(options.projectId, title, options.currentTitle())

  async function resolveDirectory(environmentId: string): Promise<string | undefined> {
    try {
      const res = await fetch(`/api/proxy/${environmentId}/path`)
      if (!res.ok) return undefined
      const payload = (await res.json()) as { directory?: string }
      return payload.directory
    } catch {
      return undefined
    }
  }

  async function resolveSessionId(environmentId: string): Promise<string | undefined> {
    try {
      const sessions = await api.get<OpenCodeSession[]>(`/proxy/${environmentId}/session`)
      const roots = Array.isArray(sessions) ? sessions.filter((s) => !s.parentID) : []
      if (roots.length === 0) return undefined
      const remembered = options.rememberedSessionId()
      const pinned = remembered ? roots.find((s) => s.id === remembered) : undefined
      const chosen =
        pinned ?? [...roots].sort((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0))[0]
      if (!chosen) return undefined
      syncTitle(chosen.title)
      if (chosen.id !== remembered) options.onResolveSession(environmentId, chosen.id)
      return chosen.id
    } catch {
      return undefined
    }
  }

  async function startFromInitialPrompt(environmentId: string): Promise<string | undefined> {
    if (!options.initialPrompt) return undefined
    try {
      const session = await api.post<OpenCodeSession>(`/proxy/${environmentId}/session`)
      if (!session?.id) return undefined
      await api.post(
        `/proxy/${environmentId}/session/${session.id}/prompt_async`,
        { parts: [{ type: "text", text: options.initialPrompt }] },
      )
      options.onResolveSession(environmentId, session.id)
      return session.id
    } catch {
      return undefined
    }
  }

  async function connect(environmentId: string) {
    const isActiveEnv = () => environmentId === options.environmentId()
    const directory = await resolveDirectory(environmentId)
    if (!isActiveEnv()) return
    if (!directory) {
      connecting = false
      return
    }
    const existingSessionId = await resolveSessionId(environmentId)
    if (!isActiveEnv()) return
    const sessionId = existingSessionId ?? (await startFromInitialPrompt(environmentId))
    if (!isActiveEnv()) return
    setRouter(() => createDirectoryRouter(directory, sessionId))
  }

  function reset() {
    setRouter(null)
    connecting = false
  }

  createEffect(() => {
    const status = options.status()
    const envId = options.environmentId()
    if (!status) return

    if (envId !== prevEnvId) {
      reset()
      prevEnvId = envId
      prevStatus = undefined
    }

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
      connect(envId)
    }

    prevStatus = status
  })

  return { router, reset }
}
