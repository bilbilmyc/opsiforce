---
name: tabs-and-navigation
description: Build navigation patterns — tabbed interfaces, collapsible sidebars, breadcrumbs, mobile hamburger menus, dashboard shells. Use when the app needs tabs on a page, a sidebar with sections, breadcrumb navigation, or a responsive header/sidebar layout. Uses pre-installed Radix primitives.
---

# Tabs & Navigation Patterns

All Radix primitives referenced below are pre-installed. No need to `bun add`.

## Tabbed content (most common)

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

## Collapsible sidebar with sections

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

## Dashboard shell (sidebar + header + content)

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

## Mobile hamburger menu (with Vaul drawer)

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

Show sidebar on desktop (`hidden md:block`), hamburger on mobile (`md:hidden`).

## Breadcrumbs

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

## Common mistakes

1. **Sidebar on mobile** — always hide with `hidden md:block` and provide a hamburger/drawer alternative.
2. **Not using `data-[state=active]:` for Radix** — Radix uses data attributes, not className props, for state styling.
3. **Forgetting `overflow-hidden` on the dashboard shell** — without it, the sidebar and content scroll together instead of independently.
