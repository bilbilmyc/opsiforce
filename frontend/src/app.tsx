import { createSignal, Show } from "solid-js"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import ProjectSidebar from "./components/project-sidebar"
import ProjectView from "./pages/project"
import { Button } from "./components/ui/button"
import type { Project } from "./api/client"

export type Route =
  | { page: "home" }
  | { page: "project"; project: Project }

const queryClient = new QueryClient()

function handleLogout() {
  window.location.href = "/oauth2/sign_out"
}

export default function App() {
  const [route, setRoute] = createSignal<Route>({ page: "home" })

  function handleOpenProject(project: Project) {
    setRoute({ page: "project", project })
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div class="h-full w-full flex flex-col bg-background">
        <header class="flex items-center justify-between px-5 h-12 border-b border-border shrink-0 bg-background">
          <span class="text-sm font-semibold text-foreground">Opsiforce</span>
          <Button variant="ghost" size="sm" class="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground" onClick={handleLogout}>
            <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3-3l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Log out
          </Button>
        </header>

        <div class="flex flex-1 min-h-0">
          <aside class="w-64 min-w-64 border-r border-sidebar-border bg-sidebar">
            <ProjectSidebar
              activeProjectId={route().page === "project" ? (route() as Extract<Route, { page: "project" }>).project.id : undefined}
              onOpenProject={handleOpenProject}
              onProjectDeleted={(id) => {
                if (route().page === "project" && (route() as Extract<Route, { page: "project" }>).project.id === id) {
                  setRoute({ page: "home" })
                }
              }}
            />
          </aside>

          <div class="flex-1 min-w-0 h-full overflow-hidden">
            <Show when={route().page === "home"}>
              <div class="flex h-full flex-col items-center justify-center gap-1">
                <span class="text-sm text-muted-foreground">No project selected</span>
                <span class="text-xs text-muted-foreground/60">Choose a project from the sidebar or create a new one</span>
              </div>
            </Show>
            <Show when={route().page === "project" ? (route() as Extract<Route, { page: "project" }>) : null} keyed>
              {(r) => (
                <ProjectView project={r.project} />
              )}
            </Show>
          </div>
        </div>
      </div>
    </QueryClientProvider>
  )
}
