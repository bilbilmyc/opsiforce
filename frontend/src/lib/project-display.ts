import type { Project } from "~/api/client"

/** Label shown for a project — its title, or a short createdAt stamp if untitled. */
export function projectDisplayTitle(project: Pick<Project, "title" | "createdAt">): string {
  if (project.title) return project.title
  return new Date(project.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
