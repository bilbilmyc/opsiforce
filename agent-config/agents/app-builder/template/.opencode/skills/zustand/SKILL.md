---
name: zustand
description: Manage client-side state with Zustand stores. Use when you need shared state across components — filters, selections, UI state, shopping cart, sidebar open/close, etc. Do NOT use for server data (use tanstack-query for that).
---

# Zustand State Management

## Create a store

```tsx
import { create } from "zustand"

interface AppStore {
  searchQuery: string
  setSearchQuery: (q: string) => void
  selectedIds: Set<number>
  toggleSelected: (id: number) => void
  clearSelected: () => void
}

export const useAppStore = create<AppStore>((set) => ({
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
  selectedIds: new Set(),
  toggleSelected: (id) => set((s) => {
    const next = new Set(s.selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    return { selectedIds: next }
  }),
  clearSelected: () => set({ selectedIds: new Set() }),
}))
```

## Use in components

```tsx
// Select specific slices (prevents unnecessary re-renders)
const searchQuery = useAppStore((s) => s.searchQuery)
const setSearchQuery = useAppStore((s) => s.setSearchQuery)
const selectedCount = useAppStore((s) => s.selectedIds.size)

// Multiple selectors — destructure only what you need
const { searchQuery, setSearchQuery } = useAppStore()  // OK for small stores, but re-renders on any change
```

**Best practice:** Always use selectors `(s) => s.field` for components that only read one or two fields.

## Store with immer (nested state updates)

For deeply nested state, use immer middleware:

```tsx
import { create } from "zustand"
import { immer } from "zustand/middleware/immer"

interface KanbanStore {
  columns: Record<string, { id: string; title: string; items: { id: string; text: string }[] }>
  moveItem: (itemId: string, fromCol: string, toCol: string) => void
  addItem: (colId: string, text: string) => void
}

export const useKanbanStore = create<KanbanStore>()(
  immer((set) => ({
    columns: {
      todo: { id: "todo", title: "To Do", items: [] },
      doing: { id: "doing", title: "In Progress", items: [] },
      done: { id: "done", title: "Done", items: [] },
    },
    moveItem: (itemId, fromCol, toCol) => set((state) => {
      const item = state.columns[fromCol].items.find(i => i.id === itemId)
      if (!item) return
      state.columns[fromCol].items = state.columns[fromCol].items.filter(i => i.id !== itemId)
      state.columns[toCol].items.push(item)
    }),
    addItem: (colId, text) => set((state) => {
      state.columns[colId].items.push({ id: crypto.randomUUID(), text })
    }),
  }))
)
```

**Note:** `immer` is built into zustand v5 — no extra install needed. Import from `zustand/middleware/immer`.

## Derived / computed values

Zustand doesn't have built-in computed properties. Use selectors:

```tsx
// Compute in the selector (recalculates on each render that uses it)
const activeCount = useAppStore((s) => [...s.selectedIds].length)
const hasSelection = useAppStore((s) => s.selectedIds.size > 0)

// For expensive computations, use useMemo in the component
const filteredItems = useMemo(
  () => items.filter(i => i.title.toLowerCase().includes(searchQuery.toLowerCase())),
  [items, searchQuery]
)
```

## Reset store

```tsx
interface FilterStore {
  status: string
  sortBy: string
  setStatus: (s: string) => void
  setSortBy: (s: string) => void
  reset: () => void
}

const initialState = { status: "all", sortBy: "newest" }

export const useFilterStore = create<FilterStore>((set) => ({
  ...initialState,
  setStatus: (status) => set({ status }),
  setSortBy: (sortBy) => set({ sortBy }),
  reset: () => set(initialState),
}))
```

## When to use what

| Need | Solution |
|---|---|
| Local to one component | `useState` |
| Shared across 2+ components (UI state, selections, sidebar state) | **Zustand** |
| Server data from API | **TanStack Query** (`useQuery` / `useMutation`) |
| Form state | **react-hook-form** |
| Filters/pagination that should persist in URL | `useSearchParams` from **react-router** |
| URL-persisted state (filters in URL) | `useSearchParams` (react-router) |

## Common mistakes

1. **Storing server data in Zustand** — use TanStack Query for anything from `/api`. Zustand is for client-only state.
2. **Destructuring the whole store** — `const { x, y } = useStore()` re-renders on ANY store change. Use `useStore(s => s.x)` for targeted re-renders.
3. **Forgetting the double parentheses with middleware** — `create<Store>()(immer(...))` — note the `()()`.
