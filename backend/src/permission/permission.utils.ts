const ROLE_PREFIX = "role:opsiforce_"
const TENANT_PREFIX = "role:opsiforce_tenant_name_"

export function parsePermissions(groupsHeader: string): string[] {
  return groupsHeader
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g.startsWith(ROLE_PREFIX) && !g.startsWith(TENANT_PREFIX))
    .map((g) => g.replace(ROLE_PREFIX, ""))
}

export function hasPermission(groupsHeader: string, permission: string): boolean {
  return parsePermissions(groupsHeader).includes(permission)
}

export function getGroupsHeader(request: { headers: Record<string, string | string[] | undefined> }): string {
  return (request.headers["x-forwarded-groups"] as string) ?? ""
}
