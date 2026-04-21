import { createFileRoute } from "@tanstack/solid-router"
import WorkspacesPage from "~/pages/workspaces"

export const Route = createFileRoute("/settings/workspaces")({
  component: WorkspacesPage,
})
