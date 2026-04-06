---
name: common-patterns
description: Common React patterns — error boundaries, loading states, empty states, responsive layouts, data fetching patterns. Use when you need to handle errors gracefully, show loading skeletons, display empty states, or set up common UI patterns that every app needs.
---

# Common Patterns

## Error boundary

```tsx
import { ErrorBoundary } from "react-error-boundary"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <AlertCircle className="h-10 w-10 text-destructive mb-4" />
      <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
      <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
      <Button variant="outline" onClick={resetErrorBoundary}>Try again</Button>
    </div>
  )
}

// Usage — wrap around any section that might fail
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <MyComponent />
</ErrorBoundary>
```

## Loading state

```tsx
import { Loader2 } from "lucide-react"

// Spinner
<div className="flex items-center justify-center p-8">
  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
</div>

// Skeleton (build simple ones with Tailwind)
<div className="space-y-3 animate-pulse">
  <div className="h-4 w-3/4 rounded bg-muted" />
  <div className="h-4 w-1/2 rounded bg-muted" />
  <div className="h-32 rounded bg-muted" />
</div>
```

## Empty state

```tsx
import { Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"

<div className="flex flex-col items-center justify-center py-16 text-center">
  <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
  <h3 className="text-lg font-medium mb-1">No items yet</h3>
  <p className="text-sm text-muted-foreground mb-4">Get started by creating your first item.</p>
  <Button onClick={onCreate}>Create Item</Button>
</div>
```

## Responsive page layout

```tsx
// Sidebar + content (desktop), stacked (mobile)
<div className="flex min-h-screen">
  <aside className="hidden md:block w-64 border-r p-4">Sidebar</aside>
  <main className="flex-1 p-4 md:p-6">Content</main>
</div>

// Dashboard grid
<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
  <StatCard title="Total" value={120} />
  <StatCard title="Active" value={85} />
</div>
```

## Conditional rendering with data

```tsx
const { data, isPending, error } = useQuery({ queryKey: ["items"], queryFn: fetchItems })

if (isPending) return <LoadingSpinner />
if (error) return <ErrorMessage error={error} />
if (data.length === 0) return <EmptyState />

return <ItemList items={data} />
```

## Confirm dialog pattern

```tsx
const [confirmOpen, setConfirmOpen] = useState(false)
const [pendingId, setPendingId] = useState<number | null>(null)

function handleDelete(id: number) {
  setPendingId(id)
  setConfirmOpen(true)
}

function confirmDelete() {
  if (pendingId) deleteMutation.mutate(pendingId)
  setConfirmOpen(false)
}
```

## Debounced search

```tsx
import { useState, useEffect } from "react"

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// Usage
const [search, setSearch] = useState("")
const debouncedSearch = useDebounce(search, 300)

const { data } = useQuery({
  queryKey: ["items", debouncedSearch],
  queryFn: () => fetch(`/api/items?q=${debouncedSearch}`).then(r => r.json()),
})
```
