import { createFileRoute } from "@tanstack/solid-router"
import SchedulesPage from "~/pages/schedules"

interface SchedulesSearch {
  environmentId?: string
}

export const Route = createFileRoute("/schedules")({
  component: SchedulesPage,
  validateSearch: (search: Record<string, unknown>): SchedulesSearch => ({
    environmentId: typeof search.environmentId === "string" ? search.environmentId : undefined,
  }),
})
