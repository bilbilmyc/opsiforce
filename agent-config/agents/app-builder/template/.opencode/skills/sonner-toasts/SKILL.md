---
name: sonner-toasts
description: Show toast notifications with Sonner. Use for success messages, error alerts, loading states, undo actions, or any transient user feedback after actions.
---

# Sonner Toasts

`<Toaster />` is already in `App.tsx`.

## Basic usage

```tsx
import { toast } from "sonner"

toast("Default notification")
toast.success("Item created successfully")
toast.error("Failed to delete item")
toast.warning("This action cannot be undone")
toast.info("New updates available")
```

## With description

```tsx
toast.success("Saved", { description: "Your changes have been saved" })
```

## With undo action

```tsx
toast("Item deleted", {
  action: { label: "Undo", onClick: () => undoDelete() },
})
```

## Loading → success pattern (with promises)

```tsx
toast.promise(saveItem(), {
  loading: "Saving...",
  success: "Saved!",
  error: "Failed to save",
})

// With mutation
toast.promise(createTask.mutateAsync(data), {
  loading: "Creating task...",
  success: "Task created!",
  error: (err) => err.message || "Failed to create task",
})
```

## Configuration options

```tsx
toast.success("Done", {
  duration: 5000,             // auto-dismiss after 5s (default: 4000)
  position: "top-right",      // top-left, top-center, top-right, bottom-left, bottom-center, bottom-right
})

// Dismiss programmatically
const id = toast.loading("Processing...")
// later:
toast.dismiss(id)
```

## Custom rich toast

```tsx
toast.custom(() => (
  <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-lg">
    <CheckCircle className="h-5 w-5 text-green-500" />
    <div>
      <p className="text-sm font-medium">Order confirmed</p>
      <p className="text-xs text-muted-foreground">Order #1234 has been placed</p>
    </div>
  </div>
))
```

## Toaster configuration

If you need to change default behavior, update the `<Toaster />` in App.tsx:

```tsx
<Toaster richColors position="top-right" closeButton />
```

- `richColors` — colored backgrounds for success/error/warning
- `closeButton` — adds an X to dismiss
- `position` — default position for all toasts
