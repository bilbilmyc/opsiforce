---
name: cmdk-command
description: Build command palettes and searchable menus with cmdk (pre-installed). Use when the user wants a Cmd+K search, spotlight-style search, command palette, or searchable dropdown. Also great for searchable select inputs.
---

# cmdk — Command Palette

`cmdk` is pre-installed. No need to `bun add`.

## Basic command palette (Cmd+K)

```tsx
import { Command } from "cmdk"
import { useState, useEffect } from "react"
import { Search, FileText, Settings, User, Home } from "lucide-react"
import { useNavigate } from "react-router-dom"

function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  function runCommand(fn: () => void) {
    setOpen(false)
    fn()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="fixed left-1/2 top-1/4 -translate-x-1/2 w-full max-w-lg">
        <Command className="rounded-xl border bg-popover shadow-2xl">
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground mr-2" />
            <Command.Input placeholder="Type a command or search..." className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No results found.</Command.Empty>
            <Command.Group heading="Pages" className="text-xs text-muted-foreground px-2 py-1.5">
              <Command.Item onSelect={() => runCommand(() => navigate("/"))} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer aria-selected:bg-accent">
                <Home className="h-4 w-4" /> Home
              </Command.Item>
              <Command.Item onSelect={() => runCommand(() => navigate("/settings"))} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer aria-selected:bg-accent">
                <Settings className="h-4 w-4" /> Settings
              </Command.Item>
            </Command.Group>
            <Command.Separator className="my-1 h-px bg-border" />
            <Command.Group heading="Actions" className="text-xs text-muted-foreground px-2 py-1.5">
              <Command.Item onSelect={() => runCommand(() => console.log("new"))} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer aria-selected:bg-accent">
                <FileText className="h-4 w-4" /> Create New Item
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
```

Add `<CommandPalette />` in `App.tsx` (outside Routes, so it works on every page).

## Searchable select (combobox)

```tsx
function SearchableSelect({ items, value, onChange, placeholder }: {
  items: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <Button variant="outline" onClick={() => setOpen(!open)} className="w-full justify-between">
        {items.find(i => i.value === value)?.label ?? placeholder ?? "Select..."}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute top-full mt-1 w-full z-50">
          <Command className="rounded-lg border bg-popover shadow-md">
            <Command.Input placeholder="Search..." className="h-9 px-3 text-sm outline-none" />
            <Command.List className="max-h-48 overflow-y-auto p-1">
              <Command.Empty className="py-4 text-center text-sm text-muted-foreground">Not found.</Command.Empty>
              {items.map(item => (
                <Command.Item
                  key={item.value}
                  onSelect={() => { onChange(item.value); setOpen(false) }}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
                >
                  {value === item.value && <Check className="h-3 w-3" />}
                  {item.label}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      )}
    </div>
  )
}
```

## Styling

cmdk uses `aria-selected` for the highlighted item. Style with `aria-selected:bg-accent` in Tailwind. The `Command.Item` component handles keyboard navigation automatically.

## Common mistakes

1. **Not adding keyboard shortcut listener** — the command palette should open with Cmd+K (Mac) / Ctrl+K (Windows).
2. **Forgetting `aria-selected:bg-accent`** on `Command.Item` — items won't highlight on keyboard navigation.
3. **Not closing the palette after selecting** — always call `setOpen(false)` in `onSelect`.
