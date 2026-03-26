import { createSignal, Show } from "solid-js"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import ProjectSidebar from "./components/project-sidebar"
import ProjectView from "./pages/project"
import type { Project } from "./api/client"

export type Route =
  | { page: "home" }
  | { page: "project"; project: Project }

const queryClient = new QueryClient()

export default function App() {
  const [route, setRoute] = createSignal<Route>({ page: "home" })

  function handleOpenProject(project: Project) {
    setRoute({ page: "project", project })
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div class="h-full w-full flex bg-[var(--color-bg)]">
        <ProjectSidebar
          activeProjectId={route().page === "project" ? (route() as Extract<Route, { page: "project" }>).project.id : undefined}
          onOpenProject={handleOpenProject}
          onNewProject={() => setRoute({ page: "home" })}
          onStopProject={(id) => {
            if (route().page === "project" && (route() as Extract<Route, { page: "project" }>).project.id === id) {
              setRoute({ page: "home" })
            }
          }}
        />

        <div class="flex-1 min-w-0 h-full overflow-hidden">
          <Show when={route().page === "home"}>
            <div class="flex h-full items-center justify-center text-gray-400 text-lg">
              Select a project or create a new one
            </div>
          </Show>
          <Show when={route().page === "project" ? (route() as Extract<Route, { page: "project" }>) : null} keyed>
            {(r) => (
              <ProjectView
                project={r.project}
                onBack={() => setRoute({ page: "home" })}
              />
            )}
          </Show>
        </div>
      </div>
    </QueryClientProvider>
  )
}
