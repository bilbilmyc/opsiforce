---
name: axios-http
description: Make HTTP requests with Axios or fetch. Use for calling external APIs, file uploads with FormData, or when you need interceptors, timeout config, or advanced HTTP features. For internal /api calls in React components, prefer tanstack-query instead.
---

# HTTP Requests

## When to use what

| Need | Use |
|---|---|
| Fetch data in React component | `useQuery` from tanstack-query skill |
| Create/update/delete in React | `useMutation` from tanstack-query skill |
| Call external API in backend service | `fetch()` or `axios` |
| Upload files | `fetch()` with `FormData` |

## fetch (built-in, preferred)

```tsx
// GET
const res = await fetch("/api/items")
const data = await res.json()

// POST
await fetch("/api/items", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "New" }),
})

// PUT
await fetch(`/api/items/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "Updated" }),
})

// DELETE
await fetch(`/api/items/${id}`, { method: "DELETE" })
```

## Axios (for external APIs or advanced needs)

```tsx
import axios from "axios"

// Create configured instance
const api = axios.create({
  baseURL: "/api",
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
})

const { data } = await api.get("/items")
await api.post("/items", { title: "New" })
await api.put(`/items/${id}`, { title: "Updated" })
await api.delete(`/items/${id}`)
```

## Error handling pattern

```tsx
// With fetch (doesn't throw on 4xx/5xx)
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message || `HTTP ${res.status}`)
  }
  return res.json()
}

// Usage in tanstack-query
useQuery({
  queryKey: ["items"],
  queryFn: () => apiFetch<Item[]>("/api/items"),
})
```

## File upload with FormData

```tsx
// Frontend
const formData = new FormData()
formData.append("file", fileObject)
formData.append("name", "my-document")

await fetch("/api/uploads", {
  method: "POST",
  body: formData,  // Do NOT set Content-Type header — browser sets it with boundary
})
```

## Calling external APIs from backend

External API calls should go through the **backend**, not the frontend (to keep API keys secret):

```typescript
// backend/src/weather/weather.service.ts
@Injectable()
export class WeatherService {
  async getWeather(city: string) {
    const res = await fetch(`https://api.example.com/weather?q=${city}&key=${process.env.API_KEY}`)
    if (!res.ok) throw new BadRequestException("Weather API error")
    return res.json()
  }
}
```

## Common mistakes

1. **Setting `Content-Type` for FormData** — let the browser set it automatically. Setting it manually breaks the multipart boundary.
2. **Calling external APIs from frontend** — API keys get exposed. Always proxy through the backend.
3. **Not checking `res.ok` with fetch** — unlike axios, fetch doesn't throw on 4xx/5xx. Always check `if (!res.ok)`.
