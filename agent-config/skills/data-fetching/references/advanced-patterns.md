# Data Fetching — advanced patterns

Advanced TanStack Query v5 branches: optimistic updates, parallel queries (`useQueries`), infinite queries, `select` transforms, and prefetch-on-hover. The core (`useQuery`/`useMutation`/query keys/invalidation/`signal`/error handling) lives in the main `data-fetching` SKILL.md.

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
