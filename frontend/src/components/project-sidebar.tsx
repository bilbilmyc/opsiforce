import { For, Show } from "solid-js"
import { createQuery, createMutation, useQueryClient } from "@tanstack/solid-query"
import { api, type Project } from "~/api/client"
import ProjectCard from "./project-card"

export default function ProjectSidebar(props: {
  activeProjectId: string | undefined
  onOpenProject: (project: Project) => void
  onNewProject: () => void
  onStopProject: (id: string) => void
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

  const resumeProject = createMutation(() => ({
    mutationFn: (projectId: string) => api.post<Project>(`/projects/${projectId}/resume`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  }))

  const stopProject = createMutation(() => ({
    mutationFn: (projectId: string) => api.post<Project>(`/projects/${projectId}/stop`),
    onSuccess: (_: Project, projectId: string) => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      props.onStopProject(projectId)
    },
  }))

  return (
    <aside class="flex w-[280px] min-w-[280px] flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-100 p-4">
      <button
        onClick={() => createProject.mutate(undefined as never)}
        disabled={createProject.isPending}
        class="mb-4 w-full inline-flex items-center justify-center rounded-md bg-zinc-50 text-zinc-900 text-sm font-medium h-9 px-4 shadow hover:bg-zinc-50/90 transition-colors disabled:opacity-50"
      >
        {createProject.isPending ? "Creating..." : "New Project"}
      </button>
      <div class="flex-1 overflow-y-auto">
        <Show when={projects.data} fallback={<div class="text-zinc-500 text-sm text-center">Loading...</div>}>
          {(data) => (
            <For each={data()}>
              {(project) => (
                <ProjectCard
                  project={project}
                  isActive={project.id === props.activeProjectId}
                  onSelect={() => props.onOpenProject(project)}
                  onResume={() => resumeProject.mutate(project.id)}
                  onStop={() => stopProject.mutate(project.id)}
                />
              )}
            </For>
          )}
        </Show>
      </div>
    </aside>
  )
}
