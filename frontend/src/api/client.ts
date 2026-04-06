const API_BASE = "/api"

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) }
  if (options?.body) {
    headers["Content-Type"] = "application/json"
  }

  const tenant = localStorage.getItem("tenant")
  if (tenant) {
    headers["x-tenant-name"] = tenant
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    if (res.status === 401) {
      window.location.reload()
      throw new Error("Unauthorized")
    }
    if (res.status === 403 && window.location.pathname !== "/permission-denied") {
      localStorage.removeItem("tenant")
      window.location.href = "/permission-denied"
      throw new Error("Forbidden")
    }
    throw new Error(`API error: ${res.status}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : undefined
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
}

export interface Tenant {
  id: string
  name: string
  displayName: string
}

export interface Project {
  id: string
  tenantId: string
  title: string | null
  description: string | null
  status: "pending" | "active" | "suspended"
  lastActiveAt: string | null
  createdAt: string
}

export interface OpenCodeSession {
  id: string
  parentID?: string
  directory: string
  title: string
  time: { created: number; updated: number }
}
