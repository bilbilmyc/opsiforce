---
name: data-fetching
description: Data fetching and server state for the frontend — TanStack Query v5 (useQuery, useMutation, useInfiniteQuery, useQueries), query keys + factories, cache invalidation, optimistic updates, prefetching on hover, query cancellation, staleTime/gcTime, select transforms, error handling. Plus raw HTTP (fetch, axios, FormData uploads) for external APIs called from the backend. Load this whenever you need to make any API request, call /api, mutate server state, upload a file, or call a third-party API. This is the standard data layer — never use raw fetch directly in components.
---

# Data Fetching

The frontend talks to the backend via `/api/...` (Vite proxies these to NestJS). `QueryClientProvider` is already wired in `main.tsx`, so `useQuery`/`useMutation` work out of the box.

**v5 changes from v4:** `isLoading` → `isPending`, `cacheTime` → `gcTime`, `keepPreviousData` is now `placeholderData: keepPreviousData`, callbacks (`onSuccess`/`onError`) removed from `useQuery` (still on `useMutation`).

## When to use what

| Need | Use |
|---|---|
| Read data in a React component | `useQuery` |
| Read many items in parallel (dynamic count) | `useQueries` |
| Paginated/infinite list | `useInfiniteQuery` |
| Create / update / delete from a component | `useMutation` |
| File upload | `useMutation` with `FormData` body |
| Call an external API (with API key) | `fetch`/`axios` from a NestJS service — never the frontend |

## useQuery

```tsx
import { useQuery } from "@tanstack/react-query"

const { data, isPending, error } = useQuery({
  queryKey: ["items"],
  queryFn: ({ signal }) => fetch("/api/items", { signal }).then(r => r.json()),
})

// With params (queryKey MUST include every variable queryFn uses)
const { data } = useQuery({
  queryKey: ["items", id],
  queryFn: ({ signal }) => fetch(`/api/items/${id}`, { signal }).then(r => r.json()),
  enabled: !!id,
})
```

Always pass `signal` to `fetch`/`axios` — TanStack cancels in-flight requests when the key changes or the component unmounts. Without it, fast typing in a search box wastes bandwidth and races.

## useMutation

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query"

const queryClient = useQueryClient()

const createItem = useMutation({
  mutationFn: (data: { title: string }) =>
    fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => r.json()),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["items"] }),
})

createItem.mutate({ title: "New item" })
// Loading state: createItem.isPending
```

## Query keys — rules

1. **Always an array** at the top level (not a string, not an object).
2. **Include every variable** the `queryFn` reads. Missing deps cause stale-data bugs and cache collisions across users/filters.
3. **Hierarchical**: `[entity, id, sub-resource, { filters }]`. Lets you invalidate at any level.
4. **JSON-serializable**: no functions, class instances, or `Symbol`s. Use `date.toISOString()` for dates.

```tsx
["items"]                          // list
["items", id]                      // detail
["items", id, "comments"]          // sub-resource
["items", { status: "active" }]    // filtered list
```

## Query key factory (recommended for any app with >5 queries)

Centralize keys so invalidation is type-safe and refactor-proof:

```tsx
// frontend/src/lib/query-keys.ts
export const itemKeys = {
  all: ["items"] as const,
  lists: () => [...itemKeys.all, "list"] as const,
  list: (filters: ItemFilters) => [...itemKeys.lists(), filters] as const,
  details: () => [...itemKeys.all, "detail"] as const,
  detail: (id: number) => [...itemKeys.details(), id] as const,
}

// Usage
useQuery({ queryKey: itemKeys.detail(id), queryFn: () => fetchItem(id) })
queryClient.invalidateQueries({ queryKey: itemKeys.all })       // everything
queryClient.invalidateQueries({ queryKey: itemKeys.detail(5) }) // item 5 + its sub-resources
```

Even better — bundle queryKey + queryFn + options together with `queryOptions`:

```tsx
import { queryOptions } from "@tanstack/react-query"

export const itemQueries = {
  detail: (id: number) => queryOptions({
    queryKey: itemKeys.detail(id),
    queryFn: ({ signal }) => fetch(`/api/items/${id}`, { signal }).then(r => r.json()),
    staleTime: 60 * 1000,
  }),
}

// Usage
const { data } = useQuery(itemQueries.detail(5))
queryClient.prefetchQuery(itemQueries.detail(5))  // shares the same config
```

## Cache invalidation

```tsx
// Prefix match (default): all queries starting with the key
queryClient.invalidateQueries({ queryKey: ["items"] })
// Matches: ["items"], ["items", 1], ["items", { status: "done" }]

// Exact: only the exact key
queryClient.invalidateQueries({ queryKey: ["items"], exact: true })

// Predicate: custom logic
queryClient.invalidateQueries({
  predicate: (q) => q.queryKey[0] === "items" && q.state.data?.userId === currentUserId,
})

// Direct cache write (no refetch)
queryClient.setQueryData(itemKeys.detail(id), newData)
```

After a mutation, **invalidate every query the change affects** — the detail row, the list, any counts, related entities. Use `variables` (the args to `mutate()`) to know which keys to hit:

```tsx
useMutation({
  mutationFn: ({ id, data }) => updateItem(id, data),
  onSuccess: (_data, { id }) => {
    queryClient.invalidateQueries({ queryKey: itemKeys.detail(id) })
    queryClient.invalidateQueries({ queryKey: itemKeys.lists() })
  },
})
```

## Optimistic updates

For checkbox toggles, deletes, edits — anything where the outcome is predictable:

```tsx
const toggleItem = useMutation({
  mutationFn: api.toggleItem,
  onMutate: async (itemId) => {
    // 1. Cancel in-flight refetches so they don't overwrite our optimistic state
    await queryClient.cancelQueries({ queryKey: itemKeys.lists() })
    // 2. Snapshot for rollback
    const previous = queryClient.getQueryData<Item[]>(itemKeys.lists())
    // 3. Apply the optimistic change
    queryClient.setQueryData<Item[]>(itemKeys.lists(), (old) =>
      old?.map((i) => i.id === itemId ? { ...i, completed: !i.completed } : i)
    )
    return { previous }
  },
  onError: (_err, _itemId, context) => {
    queryClient.setQueryData(itemKeys.lists(), context?.previous)
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: itemKeys.lists() })
  },
})
```

Always: cancel → snapshot → set → return rollback context → restore on error → invalidate on settled. Skipping `cancelQueries` causes the optimistic state to be overwritten by an in-flight refetch.

For optimistic creates with a temporary id, replace the temp record in `onSuccess` with the server-returned one.

## staleTime + gcTime

`staleTime` = how long data is considered fresh (no background refetch on remount). Default `0` = refetch on every mount.
`gcTime` = how long inactive (unobserved) data stays in the cache before being garbage collected. Default 5 min.

| Data type | staleTime |
|---|---|
| Real-time (live feeds) | `0` |
| Frequently changing (notifications) | 30s – 1m |
| User content | 1 – 5m |
| Reference data (categories, config) | 10 – 30m |
| Static | `Infinity` |

Set sensible defaults at the QueryClient level, override per-query:

```tsx
new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } })
```

## Parallel queries — useQueries

When you need to fetch a dynamic set of items in parallel (you can't call hooks in a loop):

```tsx
import { useQueries } from "@tanstack/react-query"

const queries = useQueries({
  queries: userIds.map((id) => ({
    queryKey: ["users", id],
    queryFn: ({ signal }) => fetch(`/api/users/${id}`, { signal }).then(r => r.json()),
  })),
  combine: (results) => ({
    data: results.map(r => r.data).filter(Boolean),
    isPending: results.some(r => r.isPending),
    isError: results.some(r => r.isError),
  }),
})
```

## Infinite queries

```tsx
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useInfiniteQuery({
  queryKey: ["items", filters],
  queryFn: ({ pageParam, signal }) =>
    fetch(`/api/items?cursor=${pageParam ?? ""}`, { signal }).then(r => r.json()),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
})

const items = data?.pages.flatMap((p) => p.items) ?? []
```

For offset pagination return `allPages.length + 1` (or `undefined` when the last page came back short). For bi-directional, also provide `getPreviousPageParam`.

## Transform with `select`

`select` runs only when the underlying data changes (memoized via structural sharing) — better than transforming inside the component on every render:

```tsx
const { data: completed } = useQuery({
  queryKey: itemKeys.all,
  queryFn: fetchItems,
  select: (items) => items.filter((i) => i.completed),
})

// Picking a single record from a list cache
const { data: item } = useQuery({
  queryKey: itemKeys.all,
  queryFn: fetchItems,
  select: (items) => items.find((i) => i.id === id),
})
```

If `select` depends on external state, wrap it in `useCallback` to keep the reference stable.

## Pagination — keep previous data while loading

```tsx
import { keepPreviousData } from "@tanstack/react-query"

const { data, isPlaceholderData } = useQuery({
  queryKey: ["items", page],
  queryFn: () => fetchItems(page),
  placeholderData: keepPreviousData,  // shows page N while page N+1 loads
})
```

Dim the UI with `isPlaceholderData` to signal a refresh is in flight.

## Prefetching on intent

Eliminate perceived loading time when the user is about to navigate:

```tsx
const queryClient = useQueryClient()

<Link
  to={`/items/${item.id}`}
  onMouseEnter={() => queryClient.prefetchQuery(itemQueries.detail(item.id))}
  onFocus={() => queryClient.prefetchQuery(itemQueries.detail(item.id))}
>
  {item.title}
</Link>
```

Prefetched data uses `gcTime` for retention, so set a non-zero `staleTime` on the query options to avoid an immediate refetch on click.

## Error handling

`fetch` doesn't throw on 4xx/5xx — wrap it so query/mutation errors flow correctly:

```tsx
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message || `HTTP ${res.status}`)
  }
  return res.json()
}

// Usage
useQuery({
  queryKey: itemKeys.all,
  queryFn: ({ signal }) => apiFetch<Item[]>("/api/items", { signal }),
})
```

For retry behavior: TanStack retries 3x by default on query errors. For non-retriable failures (4xx), set `retry: false` or a function that inspects the error.

## Raw HTTP — fetch and axios

For internal `/api/...` calls in components, prefer `useQuery`/`useMutation`. Use raw `fetch` only inside `queryFn`/`mutationFn`, or in backend services.

```tsx
// Built-in fetch
await fetch("/api/items", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "New" }),
})

// Axios — when you want interceptors, baseURL, or timeouts
import axios from "axios"
const api = axios.create({ baseURL: "/api", timeout: 10_000 })
const { data } = await api.get("/items")
await api.post("/items", { title: "New" })
```

Axios supports the same `signal` for cancellation: `api.get("/items", { signal })`.

## File upload — FormData

```tsx
const upload = useMutation({
  mutationFn: (file: File) => {
    const form = new FormData()
    form.append("file", file)
    return fetch("/api/uploads", { method: "POST", body: form }).then(r => r.json())
    // Do NOT set Content-Type — the browser adds the multipart boundary automatically.
  },
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["uploads"] }),
})
```

## Calling external APIs — go through the backend

External API calls must originate from the **backend**, never the frontend. Frontend code is public, so any `process.env.X` or token in the bundle is exposed.

```typescript
// backend/src/weather/weather.service.ts
@Injectable()
export class WeatherService {
  async getWeather(city: string) {
    const res = await fetch(`https://api.example.com/weather?q=${city}&key=${process.env.WEATHER_KEY}`)
    if (!res.ok) throw new BadRequestException("Weather API error")
    return res.json()
  }
}
```

The frontend then calls your backend endpoint (`/api/weather?city=...`) with `useQuery` like any other.

## Common mistakes

1. **Missing variable in `queryKey`** — every variable `queryFn` reads must be in the key, or different inputs collide on one cache entry.
2. **Forgetting to invalidate after a mutation** — UI shows stale data until the next mount. Use `onSuccess` (success only) or `onSettled` (always).
3. **No `signal` on fetch/axios** — search-as-you-type races, unmounted components keep fetching.
4. **No `cancelQueries` before optimistic update** — an in-flight refetch will overwrite your optimistic state mid-mutation.
5. **`staleTime: 0` everywhere** — refetches on every mount, kills perceived performance. Match staleTime to data volatility.
6. **Setting `Content-Type` on FormData** — breaks the multipart boundary; let the browser set it.
7. **Calling external APIs from the frontend** — leaks API keys. Always proxy through a NestJS service.
8. **Not checking `res.ok` with raw fetch** — `fetch` resolves on 4xx/5xx, so the error never reaches `useQuery`. Wrap in `apiFetch` (above).
9. **Non-serializable values in `queryKey`** (functions, class instances, `new Date()`) — breaks cache hashing. Use ISO strings for dates.
