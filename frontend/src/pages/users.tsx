import { createEffect } from "solid-js"
import { useNavigate } from "@tanstack/solid-router"
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"
import { Users } from "~/components/icons"
import RemoteComponentRuntime from "~/components/remote-component-runtime"

export default function UsersPage() {
  const navigate = useNavigate()
  const { permissions, hasPermission } = usePermissions()

  createEffect(() => {
    if (permissions.isPending) return
    if (!hasPermission(Permission.manageUsers)) {
      navigate({ to: "/" })
    }
  })

  return (
    <div class="h-full w-full overflow-y-auto bg-background">
      <div class="px-4 py-6">
        <div class="flex items-center gap-3 mb-1">
          <Users class="w-5 h-5 text-muted-foreground" />
          <h1 class="text-xl font-semibold">User Management</h1>
        </div>
        <p class="text-xs text-muted-foreground mb-5 ml-8">
          Manage users, groups, and their access across the platform.
        </p>
        <RemoteComponentRuntime
          url="/ms-assets/remoteEntry.js"
          scope="ui"
          module="App"
          type="esm"
        />
      </div>
    </div>
  )
}
