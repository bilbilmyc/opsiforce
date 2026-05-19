import { createQuery } from "@tanstack/solid-query"
import { userApi, type User } from "./client"

const MAKARA_GROUP_PREFIX = "role:makara_tenant_name_"

interface UserInfo {
  user: string
  email: string
  preferredUsername: string
  groups: string[]
}

export function useUserInfo() {
  return createQuery(() => ({
    queryKey: ["userinfo"],
    queryFn: async () => {
      const res = await fetch("/oauth2/userinfo")
      if (!res.ok) return { user: "", email: "", preferredUsername: "", groups: [] }
      const data = (await res.json()) as Partial<UserInfo>
      return {
        user: data.user ?? "",
        email: data.email ?? "",
        preferredUsername: data.preferredUsername ?? "",
        groups: data.groups ?? [],
      }
    },
  }))
}

export function parseMakaraTenants(groups: string[]): string[] {
  return groups
    .filter((g) => g.startsWith(MAKARA_GROUP_PREFIX))
    .map((g) => g.slice(MAKARA_GROUP_PREFIX.length))
}

export function useCurrentUser() {
  return createQuery(() => ({
    queryKey: ["currentUser"],
    queryFn: () => userApi.me(),
  }))
}
