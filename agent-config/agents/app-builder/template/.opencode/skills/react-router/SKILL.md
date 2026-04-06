---
name: react-router
description: Set up page routing with React Router v7. Use when the app needs multiple pages, navigation between views, URL parameters, search/query params, protected routes, or any route-based structure.
---

# React Router v7

## Setup in App.tsx

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

## Layout route (shared nav + content area)

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

## URL params

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

## Search params (filters, pagination in URL)

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

## Navigate programmatically

```tsx
const navigate = useNavigate()
navigate("/tasks/123")
navigate(-1)                    // go back
navigate("/tasks", { replace: true })  // replace history entry
```

## 404 catch-all

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

## Nested routes (e.g., settings sub-pages)

```tsx
<Route path="/settings" element={<SettingsLayout />}>
  <Route index element={<GeneralSettings />} />
  <Route path="profile" element={<ProfileSettings />} />
  <Route path="notifications" element={<NotificationSettings />} />
</Route>
```

`<Route index>` matches the parent path exactly (`/settings`).

## Common mistakes

1. **Forgetting `<Outlet />`** in layout components — child routes won't render.
2. **Using `<a href>` instead of `<Link to>`** — causes full page reload, loses app state.
3. **Putting `BrowserRouter` inside `QueryClientProvider`** — should be fine either way, but keep BrowserRouter as outermost wrapper in App.tsx for consistency.
4. **Not enabling query with `enabled: !!id`** — useParams returns `string | undefined`, so guard against undefined in data fetching.
