import { For, Show, createMemo, createSignal } from "solid-js"
import { createQuery, createMutation, useQueryClient } from "@tanstack/solid-query"
import { useNavigate, useMatch } from "@tanstack/solid-router"
import { api, type Project } from "~/api/client"
import { LoaderCircle, FolderOpen } from "~/components/icons"
import ProjectCard from "./project-card"
import ProjectSettings from "./project-settings"

export default function ProjectSidebar(props: { search: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const projectMatch = useMatch({ from: "/projects/$projectId", shouldThrow: false })
  const activeProjectId = () => projectMatch()?.params.projectId
  const [settingsProjectId, setSettingsProjectId] = createSignal<string | null>(null)

  const projects = createQuery(() => ({
    queryKey: ["projects", "list"],
    queryFn: () => api.get<Project[]>("/projects"),
  }))

  const filteredProjects = createMemo(() => {
    const list = projects.data
    if (!list) return []
    const q = props.search.toLowerCase().trim()
    if (!q) return list
    return list.filter((p) => {
      const title = p.title ?? ""
      return title.toLowerCase().includes(q)
    })
  })

  const renameProject = createMutation(() => ({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch<Project>(`/projects/${id}`, { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  }))

  return (
    <>
      <Show
        when={projects.data}
        fallback={
          <div class="flex items-center justify-center py-10">
            <LoaderCircle class="w-4 h-4 text-muted-foreground animate-spin" />
          </div>
        }
      >
        {(data) => (
          <Show
            when={data().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-8 px-4 text-center">
                <FolderOpen class="w-10 h-10 text-muted-foreground/30 mb-3" stroke-width="1" />
                <p class="text-xs text-muted-foreground">No projects yet</p>
                <p class="text-xs text-muted-foreground/60 mt-0.5">Create one to get started</p>
              </div>
            }
          >
            <Show
              when={filteredProjects().length > 0}
              fallback={
                <div class="px-4 py-6 text-center">
                  <p class="text-xs text-muted-foreground">No matching projects</p>
                </div>
              }
            >
              <div class="flex flex-col gap-0.5">
                <For each={filteredProjects()}>
                  {(project) => (
                    <ProjectCard
                      project={project}
                      isActive={project.id === activeProjectId()}
                      onSelect={() => navigate({ to: "/projects/$projectId", params: { projectId: project.id }, search: { prompt: undefined } })}
                      onRename={(id, title) => renameProject.mutate({ id, title })}
                      onSettings={() => setSettingsProjectId(project.id)}
                      onDeleted={() => {
                        if (project.id === activeProjectId()) navigate({ to: "/" })
                      }}
                      onDuplicated={(p) => navigate({ to: "/projects/$projectId", params: { projectId: p.id }, search: { prompt: undefined } })}
                    />
                  )}
                </For>
              </div>
            </Show>
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
