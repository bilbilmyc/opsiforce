---
name: search-and-filter
description: Build combined search, filter, and sort UI with URL-synced state. Use when the app needs a filter bar, search input with category filters, faceted filtering, or any list page where users filter and sort data. Covers frontend filter UI and backend dynamic WHERE clauses.
---

# Search & Filter — End-to-End Pattern

Combines search input + dropdown filters + sort + pagination, synced to URL params so filters survive page refresh.

## Filter bar component

```tsx
import { useSearchParams } from "react-router-dom"
import { Search, X, SlidersHorizontal } from "lucide-react"

function FilterBar({ statuses, categories }: { statuses: string[]; categories: string[] }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get("q") ?? ""
  const status = searchParams.get("status") ?? "all"
  const category = searchParams.get("category") ?? "all"
  const sortBy = searchParams.get("sort") ?? "newest"

  function setFilter(key: string, value: string) {
    setSearchParams(prev => {
      if (value === "all" || value === "") prev.delete(key)
      else prev.set(key, value)
      prev.delete("page")
      return prev
    })
  }

  function clearAll() {
    setSearchParams({})
  }

  const hasFilters = q || status !== "all" || category !== "all"

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setFilter("q", e.target.value)}
          placeholder="Search..."
          className="pl-9"
        />
      </div>
      <select value={status} onChange={(e) => setFilter("status", e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
        <option value="all">All statuses</option>
        {statuses.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={category} onChange={(e) => setFilter("category", e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
        <option value="all">All categories</option>
        {categories.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={sortBy} onChange={(e) => setFilter("sort", e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="name">Name A-Z</option>
      </select>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X className="h-4 w-4 mr-1" /> Clear
        </Button>
      )}
    </div>
  )
}
```

## Fetching filtered data with TanStack Query

```tsx
function ItemList() {
  const [searchParams] = useSearchParams()
  const q = searchParams.get("q") ?? ""
  const status = searchParams.get("status") ?? ""
  const category = searchParams.get("category") ?? ""
  const sort = searchParams.get("sort") ?? "newest"
  const page = Number(searchParams.get("page") ?? "1")

  const { data, isPending } = useQuery({
    queryKey: ["items", { q, status, category, sort, page }],
    queryFn: () => {
      const params = new URLSearchParams()
      if (q) params.set("q", q)
      if (status) params.set("status", status)
      if (category) params.set("category", category)
      params.set("sort", sort)
      params.set("page", String(page))
      params.set("limit", "20")
      return fetch(`/api/items?${params}`).then(r => r.json())
    },
  })
}
```

## Backend: dynamic WHERE clauses (safe, parameterized)

```typescript
@Get()
findAll(
  @Query("q") q?: string,
  @Query("status") status?: string,
  @Query("category") category?: string,
  @Query("sort") sort?: string,
  @Query("page") page?: string,
  @Query("limit") limit?: string,
) {
  const conditions: string[] = []
  const params: unknown[] = []

  if (q) {
    conditions.push("(title LIKE ? OR description LIKE ?)")
    params.push(`%${q}%`, `%${q}%`)
  }
  if (status) {
    conditions.push("status = ?")
    params.push(status)
  }
  if (category) {
    conditions.push("category = ?")
    params.push(category)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const orderMap: Record<string, string> = {
    newest: "created_at DESC",
    oldest: "created_at ASC",
    name: "title ASC",
  }
  const orderBy = orderMap[sort ?? "newest"] ?? "created_at DESC"

  const pageNum = Math.max(1, Number(page ?? 1))
  const pageSize = Math.min(100, Math.max(1, Number(limit ?? 20)))
  const offset = (pageNum - 1) * pageSize

  const items = this.db.queryAll(
    `SELECT * FROM items ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  )

  const { total } = this.db.queryOne<{ total: number }>(
    `SELECT COUNT(*) as total FROM items ${where}`,
    params
  )!

  return { items, total, page: pageNum, pageSize, totalPages: Math.ceil(total / pageSize) }
}
```

**CRITICAL:** Always use `?` placeholders for user input. Never interpolate `q` directly into SQL strings — SQL injection risk.

## Pagination controls

```tsx
function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}

// Wire to URL params
const [searchParams, setSearchParams] = useSearchParams()
<Pagination page={page} totalPages={data.totalPages} onPageChange={(p) => setSearchParams(prev => { prev.set("page", String(p)); return prev })} />
```

## Debounced search (prevent API calls on every keystroke)

```tsx
const [localQuery, setLocalQuery] = useState(q)

useEffect(() => {
  const timer = setTimeout(() => setFilter("q", localQuery), 300)
  return () => clearTimeout(timer)
}, [localQuery])

<Input value={localQuery} onChange={(e) => setLocalQuery(e.target.value)} />
```

## Common mistakes

1. **Not resetting page when filters change** — changing a filter should reset to page 1, or users see empty pages.
2. **Interpolating search terms in SQL** — always use `?` parameterized queries to prevent injection.
3. **Not syncing with URL** — use `useSearchParams` so filters survive refresh and can be shared as links.
4. **Filtering large datasets client-side** — for 100+ items, filter on the backend. Client-side filtering is OK for <100 items.
