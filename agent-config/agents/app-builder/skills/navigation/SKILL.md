---
name: navigation
description: Set up app routing, layout chrome, and URL-synced state. Use for multi-page apps with React Router v7 (routes, params, nested layouts), layout shells with sidebars / tabs / breadcrumbs / mobile hamburger menus, and list pages where search / filter / sort / pagination live in the URL — including the dynamic backend WHERE clauses that read those params. Uses pre-installed Radix primitives and Vaul.
---

# Navigation — Routing, Layout, and URL State

Everything to do with how a user moves through the app and how that movement is reflected in the URL.

- **Routing** — pages, params, nested routes, programmatic navigation (React Router v7)
- **Layout chrome** — dashboard shells, sidebars, breadcrumbs, mobile hamburger
- **In-page navigation** — tabs (Radix-based)
- **URL-synced state** — filter bars, search, sort, pagination, plus the matching backend query

All Radix primitives below are pre-installed.

---

## 1. Routing (React Router v7)

### Setup in App.tsx

```tsx
import { BrowserRouter, Routes, Route, Link, NavLink, useNavigate, useParams, useSearchParams, Outlet } from "react-router-dom"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

### Layout route (shared nav + content area)

```tsx
function Layout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b bg-background px-6 py-3 flex items-center gap-4">
        <NavLink to="/" className={({ isActive }) => cn("text-sm font-medium", isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
          Home
        </NavLink>
        <NavLink to="/tasks" className={({ isActive }) => cn("text-sm font-medium", isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
          Tasks
        </NavLink>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
```

**Key:** `<Outlet />` renders the matched child route. This is how you share a navbar/sidebar across all pages.

### URL params

```tsx
function TaskDetail() {
  const { id } = useParams()
  const { data } = useQuery({
    queryKey: ["tasks", id],
    queryFn: () => fetch(`/api/tasks/${id}`).then(r => r.json()),
    enabled: !!id,
  })
}
```

### Search params (filters, pagination in URL)

```tsx
function TaskList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get("status") ?? "all"
  const page = Number(searchParams.get("page") ?? "1")

  const { data } = useQuery({
    queryKey: ["tasks", { status, page }],
    queryFn: () => fetch(`/api/tasks?status=${status}&page=${page}`).then(r => r.json()),
  })

  function setFilter(newStatus: string) {
    setSearchParams({ status: newStatus, page: "1" })
  }

  function setPage(newPage: number) {
    setSearchParams(prev => {
      prev.set("page", String(newPage))
      return prev
    })
  }
}
```

### Navigate programmatically

```tsx
const navigate = useNavigate()
navigate("/tasks/123")
navigate(-1)                          // go back
navigate("/tasks", { replace: true }) // replace history entry
```

### 404 catch-all

```tsx
function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <p className="text-muted-foreground mb-4">Page not found</p>
      <Button asChild><Link to="/">Go home</Link></Button>
    </div>
  )
}
```

Place `<Route path="*" element={<NotFound />} />` as the **last route** inside the layout.

### Nested routes (e.g., settings sub-pages)

```tsx
<Route path="/settings" element={<SettingsLayout />}>
  <Route index element={<GeneralSettings />} />
  <Route path="profile" element={<ProfileSettings />} />
  <Route path="notifications" element={<NotificationSettings />} />
</Route>
```

`<Route index>` matches the parent path exactly (`/settings`).

---

## 2. Layout chrome

### Dashboard shell (sidebar + header + content)

```tsx
import { Outlet } from "react-router-dom"

function DashboardLayout() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b flex items-center justify-between px-6">
          <h1 className="text-sm font-medium">Dashboard</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon"><Bell className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon"><User className="h-4 w-4" /></Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

Use as a layout route in App.tsx:
```tsx
<Route element={<DashboardLayout />}>
  <Route path="/" element={<Overview />} />
  <Route path="/documents" element={<Documents />} />
</Route>
```

### Collapsible sidebar with sections

```tsx
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { ChevronRight, Home, FileText, Settings, Users } from "lucide-react"
import { NavLink } from "react-router-dom"

const navSections = [
  { title: "Main", items: [
    { label: "Dashboard", href: "/", icon: Home },
    { label: "Documents", href: "/documents", icon: FileText },
  ]},
  { title: "Admin", items: [
    { label: "Users", href: "/users", icon: Users },
    { label: "Settings", href: "/settings", icon: Settings },
  ]},
]

function Sidebar() {
  return (
    <aside className="w-64 border-r bg-sidebar text-sidebar-foreground p-4 space-y-4">
      <h2 className="text-lg font-semibold px-2">App Name</h2>
      {navSections.map((section) => (
        <CollapsiblePrimitive.Root key={section.title} defaultOpen>
          <CollapsiblePrimitive.Trigger className="flex items-center gap-1 w-full px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground">
            <ChevronRight className="h-3 w-3 transition-transform data-[state=open]:rotate-90" />
            {section.title}
          </CollapsiblePrimitive.Trigger>
          <CollapsiblePrimitive.Content className="space-y-0.5 mt-1">
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) => cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </CollapsiblePrimitive.Content>
        </CollapsiblePrimitive.Root>
      ))}
    </aside>
  )
}
```

### Mobile hamburger menu (with Vaul drawer)

```tsx
import { Drawer } from "vaul"
import { Menu } from "lucide-react"

function MobileNav() {
  return (
    <div className="md:hidden">
      <Drawer.Root direction="left">
        <Drawer.Trigger asChild>
          <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
        </Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-background">
            <div className="p-4">
              <Drawer.Title className="text-lg font-semibold mb-4">Navigation</Drawer.Title>
              <Sidebar />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  )
}
```

Show the sidebar on desktop (`hidden md:block`) and the hamburger on mobile (`md:hidden`).

### Breadcrumbs

```tsx
import { useLocation, Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"

function Breadcrumbs() {
  const location = useLocation()
  const segments = location.pathname.split("/").filter(Boolean)

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
      <Link to="/" className="hover:text-foreground">Home</Link>
      {segments.map((segment, i) => {
        const path = `/${segments.slice(0, i + 1).join("/")}`
        const isLast = i === segments.length - 1
        const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ")
        return (
          <span key={path} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            {isLast ? (
              <span className="text-foreground font-medium">{label}</span>
            ) : (
              <Link to={path} className="hover:text-foreground">{label}</Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
```

---

## 3. In-page navigation: Tabs

```tsx
import * as TabsPrimitive from "@radix-ui/react-tabs"

function TabsSection() {
  return (
    <TabsPrimitive.Root defaultValue="overview" className="w-full">
      <TabsPrimitive.List className="flex border-b">
        <TabsPrimitive.Trigger value="overview" className="px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary -mb-px">
          Overview
        </TabsPrimitive.Trigger>
        <TabsPrimitive.Trigger value="details" className="px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary -mb-px">
          Details
        </TabsPrimitive.Trigger>
        <TabsPrimitive.Trigger value="settings" className="px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary -mb-px">
          Settings
        </TabsPrimitive.Trigger>
      </TabsPrimitive.List>
      <TabsPrimitive.Content value="overview" className="py-4">Overview content</TabsPrimitive.Content>
      <TabsPrimitive.Content value="details" className="py-4">Details content</TabsPrimitive.Content>
      <TabsPrimitive.Content value="settings" className="py-4">Settings content</TabsPrimitive.Content>
    </TabsPrimitive.Root>
  )
}
```

**Key:** `data-[state=active]:` is how Radix exposes state in Tailwind. No `useState` needed — Radix manages active tab internally.

---

## 4. URL-synced search, filter, sort, pagination

Combines a search input + dropdown filters + sort + pagination, all reflected in URL params so filters survive refresh and can be shared as links.

### Filter bar component

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

### Fetching filtered data with TanStack Query

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

### Pagination controls

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

### Debounced search (prevent API calls on every keystroke)

```tsx
const [localQuery, setLocalQuery] = useState(q)

useEffect(() => {
  const timer = setTimeout(() => setFilter("q", localQuery), 300)
  return () => clearTimeout(timer)
}, [localQuery])

<Input value={localQuery} onChange={(e) => setLocalQuery(e.target.value)} />
```

### Backend: dynamic WHERE clauses (safe, parameterized)

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

---

## Common mistakes

**Routing**
1. **Forgetting `<Outlet />`** in layout components — child routes won't render.
2. **Using `<a href>` instead of `<Link to>`** — causes full page reload, loses app state.
3. **Not guarding `useParams()` with `enabled: !!id`** — `useParams` returns `string | undefined`; unguarded queries fire with `undefined`.

**Layout chrome**
4. **Sidebar visible on mobile** — always hide with `hidden md:block` and provide a hamburger/drawer alternative.
5. **Forgetting `overflow-hidden` on the dashboard shell** — without it, sidebar and content scroll together instead of independently.
6. **Hand-rolling tab state** — Radix manages it; style with `data-[state=active]:` rather than tracking active tab in `useState`.

**URL-synced filters**
7. **Not resetting page when filters change** — changing a filter should reset to page 1, or users see empty pages.
8. **Interpolating search terms directly into SQL** — always use `?` parameterized queries to prevent injection.
9. **Filter state held in `useState` instead of URL** — use `useSearchParams` so filters survive refresh and are shareable.
10. **Filtering large datasets client-side** — for 100+ items, filter on the backend. Client-side filtering is OK for under 100 items.
