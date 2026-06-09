import { createFileRoute } from "@tanstack/solid-router"
import UsersPage from "~/pages/users"

export const Route = createFileRoute("/settings/users")({
  component: UsersPage,
})
