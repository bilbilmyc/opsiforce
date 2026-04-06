---
name: tanstack-query
description: TanStack Query v5 data fetching patterns including useQuery, useMutation, cache management, and API service integration. Use when fetching data from the backend API, managing server state, handling mutations, invalidating caches, or working with any /api endpoint. This is the standard way to fetch data — always use it instead of raw fetch in components.
---

# TanStack Query v5 Patterns

## Purpose

Data fetching with TanStack Query v5. Already configured in `main.tsx` with `QueryClientProvider`.

**v5 changes from v4:** `isLoading` → `isPending`, `cacheTime` → `gcTime`, callbacks removed from useQuery.

## Fetch data

```tsx
import { useQuery } from "@tanstack/react-query"

const { data, isPending, error } = useQuery({
  queryKey: ["items"],
  queryFn: () => fetch("/api/items").then(r => r.json()),
})

// With params
const { data } = useQuery({
  queryKey: ["items", id],
  queryFn: () => fetch(`/api/items/${id}`).then(r => r.json()),
  enabled: !!id,
})
```

## Mutations

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

// Usage
createItem.mutate({ title: "New item" })
```

## Optimistic updates

```tsx
const mutation = useMutation({
  mutationFn: updateItem,
  onMutate: async (updated) => {
    await queryClient.cancelQueries({ queryKey: ["items", updated.id] })
    const previous = queryClient.getQueryData(["items", updated.id])
    queryClient.setQueryData(["items", updated.id], updated)
    return { previous }
  },
  onError: (_err, updated, context) => {
    queryClient.setQueryData(["items", updated.id], context?.previous)
  },
  onSettled: (_data, _err, updated) => {
    queryClient.invalidateQueries({ queryKey: ["items", updated.id] })
  },
})
```

## Cache invalidation

```tsx
queryClient.invalidateQueries({ queryKey: ["items"] })       // all items queries
queryClient.invalidateQueries({ queryKey: ["items", id] })    // specific item
queryClient.setQueryData(["items", id], newData)              // manual update
```

## Query key patterns

```tsx
["items"]                          // list
["items", id]                      // detail
["items", { status: "active" }]    // filtered list
["users", userId, "items"]         // nested resource
```

## Best practices

- `queryKey` must include all params that affect the result
- Always invalidate after mutations
- Use `enabled: false` for dependent/conditional queries
- Prefer `useQuery` + `isPending` over manual loading state
