import { createFileRoute } from "@tanstack/solid-router"
import SchedulesPage from "~/pages/schedules"

interface SchedulesSearch {
  project?: string
}

export const Route = createFileRoute("/schedules")({
  component: SchedulesPage,
  validateSearch: (search: Record<string, unknown>): SchedulesSearch => ({
    project: typeof search.project === "string" ? search.project : undefined,
  }),
})
