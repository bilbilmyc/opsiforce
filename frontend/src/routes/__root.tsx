import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { Outlet, createRootRoute, useNavigate, useRouter } from "@tanstack/solid-router"
import { TanStackDevtools } from "@tanstack/solid-devtools"
import { SolidQueryDevtoolsPanel } from "@tanstack/solid-query-devtools"
import { TanStackRouterDevtoolsPanel } from "@tanstack/solid-router-devtools"
import ProjectSidebar from "~/components/project-sidebar"
import { Button } from "~/components/ui/button"

const queryClient = new QueryClient()

function handleLogout() {
  window.location.href = "/oauth2/sign_out"
}

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const navigate = useNavigate()
  const router = useRouter()

  return (
    <QueryClientProvider client={queryClient}>
      <div class="h-full w-full flex flex-col bg-background">
        <header class="flex items-center justify-between px-5 h-12 border-b border-border shrink-0 bg-background">
          <span
            class="text-sm font-semibold text-foreground cursor-pointer"
            onClick={() => navigate({ to: "/" })}
          >
            Opsiforce
          </span>
          <Button variant="ghost" size="sm" class="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground" onClick={handleLogout}>
            <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3-3l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Log out
          </Button>
        </header>

        <div class="flex flex-1 min-h-0">
          <aside class="w-64 min-w-64 border-r border-sidebar-border bg-sidebar">
            <ProjectSidebar />
          </aside>

          <div class="flex-1 min-w-0 h-full overflow-hidden">
            <Outlet />
          </div>
        </div>
      </div>
      <TanStackDevtools
        plugins={[
          {
            name: "TanStack Query",
            render: () => <SolidQueryDevtoolsPanel client={queryClient} />,
          },
          {
            name: "TanStack Router",
            render: () => <TanStackRouterDevtoolsPanel router={router} />,
          },
        ]}
      />
    </QueryClientProvider>
  )
}
