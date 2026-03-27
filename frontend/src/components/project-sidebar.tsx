import { For, Show } from "solid-js"
import { createQuery, createMutation, useQueryClient } from "@tanstack/solid-query"
import { api, type Project } from "~/api/client"
import { Button } from "~/components/ui/button"
import ProjectCard from "./project-card"

export default function ProjectSidebar(props: {
  activeProjectId: string | undefined
  onOpenProject: (project: Project) => void
  onProjectDeleted: (id: string) => void
}) {
  const qc = useQueryClient()

  const projects = createQuery(() => ({
    queryKey: ["projects", "list"],
    queryFn: () => api.get<Project[]>("/projects"),
    refetchInterval: (query: { state: { data: Project[] | undefined } }) => {
      const data = query.state.data
      if (!data) return false
      const hasTransitional = data.some((r) => r.status === "pending" || r.status === "starting")
      return hasTransitional ? 2000 : false
    },
  }))

  const createProject = createMutation(() => ({
    mutationFn: () => api.post<Project>("/projects"),
    onSuccess: (project: Project) => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      props.onOpenProject(project)
    },
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
      props.onProjectDeleted(id)
    },
  }))

  return (
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between px-3 h-11 shrink-0">
        <h2 class="text-sm font-semibold text-sidebar-foreground tracking-tight">Projects</h2>
        <Button
          variant="outline"
          size="sm"
          class="h-7 px-2.5 text-xs gap-1 font-normal"
          onClick={() => createProject.mutate(undefined as never)}
          disabled={createProject.isPending}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14m7-7H5" />
          </svg>
          {createProject.isPending ? "Creating..." : "New project"}
        </Button>
      </div>

      <div class="flex-1 overflow-y-auto sidebar-scroll px-2 pb-2">
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
                <div class="flex flex-col items-center justify-center py-16 px-6 text-center">
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
                      isActive={project.id === props.activeProjectId}
                      onSelect={() => props.onOpenProject(project)}
                      onRename={(id, title) => renameProject.mutate({ id, title })}
                      onDelete={(id) => deleteProject.mutate(id)}
                    />
                  )}
                </For>
              </div>
            </Show>
          )}
        </Show>
      </div>
    </div>
  )
}
