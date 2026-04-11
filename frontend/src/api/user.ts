import { createQuery } from "@tanstack/solid-query"

interface UserInfo {
  user: string
  email: string
  preferredUsername: string
}

export function useUserInfo() {
  return createQuery(() => ({
    queryKey: ["userinfo"],
    queryFn: async () => {
      const res = await fetch("/oauth2/userinfo")
      if (!res.ok) return { user: "", email: "", preferredUsername: "" }
      return res.json() as Promise<UserInfo>
    },
    staleTime: Infinity,
  }))
}
