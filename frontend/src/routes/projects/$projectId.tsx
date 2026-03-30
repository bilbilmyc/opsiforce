import { createFileRoute } from "@tanstack/solid-router"
import ProjectView from "~/pages/project"

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectPage,
})

function ProjectPage() {
  const params = Route.useParams()
  return <ProjectView projectId={params().projectId} />
}
