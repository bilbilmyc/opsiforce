import { createFileRoute } from "@tanstack/solid-router"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  return (
    <div class="flex h-full flex-col items-center justify-center gap-1">
      <span class="text-sm text-muted-foreground">No project selected</span>
      <span class="text-xs text-muted-foreground/60">Choose a project from the sidebar or create a new one</span>
    </div>
  )
}
