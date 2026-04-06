---
name: shadcn
description: shadcn/ui component library — pre-built components (Button, Card, Input, Badge) and Radix UI primitives. Use when creating or modifying UI components like dialogs, dropdowns, tables, tabs, accordions, tooltips, or forms. For layout and theme customization use tailwindcss skill instead.
---

# shadcn/ui Development Guidelines

Components are pre-copied into `frontend/src/components/ui/`. Modify them directly. Built on Radix UI primitives with full accessibility.

## Pre-installed Components

Import from `@/components/ui/<name>`:

- **Button** — variants: default, destructive, outline, secondary, ghost, link; sizes: default, sm, lg, icon
- **Card** — CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- **Input** — text input with focus ring
- **Badge** — variants: default, secondary, destructive, outline

## Adding New Components

All Radix primitives are pre-installed. Create new components in `frontend/src/components/ui/`:

### Pattern

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

function MyComponent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("base-classes", className)} {...props} />
}
export { MyComponent }
```

### With Variants (cva)

```tsx
import { cva, type VariantProps } from "class-variance-authority"

const myVariants = cva("base-classes", {
  variants: {
    variant: { default: "bg-primary text-primary-foreground", outline: "border bg-background" },
    size: { default: "h-9 px-4", sm: "h-8 px-3" },
  },
  defaultVariants: { variant: "default", size: "default" },
})
```

### Available Radix Primitives

All pre-installed (no need to `bun add`):

`@radix-ui/react-dialog`, `react-dropdown-menu`, `react-select`, `react-popover`, `react-tooltip`, `react-tabs`, `react-toast`, `react-accordion`, `react-checkbox`, `react-label`, `react-switch`, `react-separator`, `react-scroll-area`, `react-avatar`, `react-toggle`, `react-toggle-group`, `react-alert-dialog`, `react-progress`, `react-slot`, `react-slider`, `react-radio-group`, `react-collapsible`, `react-context-menu`, `react-hover-card`, `react-menubar`, `react-navigation-menu`, `react-aspect-ratio`

## Common Components to Create

### Dialog

```tsx
import * as DialogPrimitive from "@radix-ui/react-dialog"

<DialogPrimitive.Root>
  <DialogPrimitive.Trigger asChild><Button>Open</Button></DialogPrimitive.Trigger>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50" />
    <DialogPrimitive.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background rounded-lg p-6 shadow-lg">
      <DialogPrimitive.Title className="text-lg font-semibold">Title</DialogPrimitive.Title>
      <DialogPrimitive.Description className="text-sm text-muted-foreground">Description</DialogPrimitive.Description>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
```

### Table

```tsx
<table className="w-full">
  <thead>
    <tr className="border-b">
      <th className="px-4 py-2 text-left text-sm font-medium text-muted-foreground">Title</th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b hover:bg-muted/50">
      <td className="px-4 py-2 text-sm">Content</td>
    </tr>
  </tbody>
</table>
```

### Dropdown Menu

```tsx
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
```

## Theming

All components use CSS variables from `index.css` (OKLCH format). Override in `:root` for light, `.dark` for dark mode.

## Utils

```tsx
import { cn } from "@/lib/utils"  // merges classes: cn("px-4", condition && "bg-red-500")
```
