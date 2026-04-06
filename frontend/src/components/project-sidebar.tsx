import { For, Show, createSignal } from "solid-js"
import { createQuery, createMutation, useQueryClient } from "@tanstack/solid-query"
import { useNavigate, useMatch } from "@tanstack/solid-router"
import { api, type Project } from "~/api/client"
import ProjectCard from "./project-card"
import ProjectSettings from "./project-settings"

export default function ProjectSidebar() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const projectMatch = useMatch({ from: "/projects/$projectId", shouldThrow: false })
  const activeProjectId = () => projectMatch()?.params.projectId

  const [settingsProjectId, setSettingsProjectId] = createSignal<string | null>(null)

  const projects = createQuery(() => ({
    queryKey: ["projects", "list"],
    queryFn: () => api.get<Project[]>("/projects"),
  }))

  const renameProject = createMutation(() => ({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch<Project>(`/projects/${id}`, { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  }))

  const deleteProject = createMutation(() => ({
    mutationFn: (id: string) => api.delete<void>(`/projects/${id}`),
    onSuccess: (_: void, id: string) => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      if (activeProjectId() === id) navigate({ to: "/" })
    },
  }))

  return (
    <>
      <Show
        when={projects.data}
        fallback={
          <div class="flex items-center justify-center py-10">
            <svg class="w-4 h-4 text-muted-foreground animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        }
      >
        {(data) => (
          <Show
            when={data().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-8 px-4 text-center">
                <svg class="w-10 h-10 text-muted-foreground/30 mb-3" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                </svg>
                <p class="text-xs text-muted-foreground">No projects yet</p>
                <p class="text-xs text-muted-foreground/60 mt-0.5">Create one to get started</p>
              </div>
            }
          >
            <div class="flex flex-col gap-0.5">
              <For each={data()}>
                {(project) => (
                  <ProjectCard
                    project={project}
                    isActive={project.id === activeProjectId()}
                    onSelect={() => navigate({ to: "/projects/$projectId", params: { projectId: project.id } })}
                    onRename={(id, title) => renameProject.mutate({ id, title })}
                    onDelete={(id) => deleteProject.mutate(id)}
                    onSettings={(id) => setSettingsProjectId(id)}
                  />
                )}
              </For>
            </div>
          </Show>
        )}
      </Show>

      <Show when={settingsProjectId()}>
        {(projectId) => (
          <ProjectSettings
            projectId={projectId()}
            open={true}
            onOpenChange={(open) => { if (!open) setSettingsProjectId(null) }}
          />
        )}
      </Show>
    </>
  )
}
