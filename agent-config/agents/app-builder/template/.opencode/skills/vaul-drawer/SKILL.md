---
name: vaul-drawer
description: Create mobile-friendly drawer/sheet components with Vaul (pre-installed). Use for bottom sheets, slide-out panels, mobile navigation menus, or any overlay content that should be swipeable on mobile.
---

# Vaul — Drawer / Bottom Sheet

`vaul` is pre-installed. No need to `bun add`.

## Basic drawer

```tsx
import { Drawer } from "vaul"

function DrawerDemo() {
  return (
    <Drawer.Root>
      <Drawer.Trigger asChild>
        <Button>Open Drawer</Button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-xl">
          <div className="mx-auto mt-4 h-1.5 w-12 rounded-full bg-muted" />
          <div className="p-6">
            <Drawer.Title className="text-lg font-semibold mb-2">Title</Drawer.Title>
            <Drawer.Description className="text-sm text-muted-foreground mb-4">
              Description text here.
            </Drawer.Description>
            <div className="space-y-4">
              {/* Drawer content */}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
```

The drag handle (`h-1.5 w-12 rounded-full bg-muted`) is a visual cue that users can swipe to dismiss.

## Controlled drawer

```tsx
const [open, setOpen] = useState(false)

<Drawer.Root open={open} onOpenChange={setOpen}>
  <Drawer.Portal>
    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
    <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-xl">
      {/* content */}
      <Button onClick={() => setOpen(false)}>Close</Button>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

// Open programmatically
<Button onClick={() => setOpen(true)}>Open</Button>
```

## Right-side drawer (sidebar panel)

```tsx
<Drawer.Root direction="right">
  <Drawer.Trigger asChild><Button>Details</Button></Drawer.Trigger>
  <Drawer.Portal>
    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
    <Drawer.Content className="fixed right-0 top-0 bottom-0 z-50 w-96 bg-background border-l">
      <div className="p-6">
        <Drawer.Title className="text-lg font-semibold">Details</Drawer.Title>
        {/* content */}
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

## Responsive dialog (dialog on desktop, drawer on mobile)

```tsx
function ResponsiveModal({ open, onOpenChange, title, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: React.ReactNode
}) {
  const isMobile = window.innerWidth < 768

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-xl max-h-[85vh]">
            <div className="mx-auto mt-4 h-1.5 w-12 rounded-full bg-muted" />
            <div className="p-6 overflow-y-auto">
              <Drawer.Title className="text-lg font-semibold mb-4">{title}</Drawer.Title>
              {children}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    )
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background rounded-lg p-6 shadow-lg w-full max-w-md">
          <DialogPrimitive.Title className="text-lg font-semibold mb-4">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
```

## Common mistakes

1. **Missing `Drawer.Overlay`** — without it, the background isn't dimmed and clicks pass through.
2. **Forgetting `z-50`** — drawer needs high z-index to appear above other content.
3. **No drag handle** — users don't know they can swipe. Always add the pill-shaped handle at the top.
