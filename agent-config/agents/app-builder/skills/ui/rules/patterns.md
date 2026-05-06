# Composition Patterns (Recipes)

Worked examples for the most common UI patterns. Pair with `composition.md` (the rules) and `forms.md` (form-specific recipes).

## Dialog with a form

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

<Dialog>
  <DialogTrigger asChild><Button>New item</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Create item</DialogTitle>
      <DialogDescription>Add a new item to the list.</DialogDescription>
    </DialogHeader>
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} />
      </div>
      <DialogFooter>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

## AlertDialog for destructive confirmations

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild><Button variant="destructive">Delete</Button></AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete this item?</AlertDialogTitle>
      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={() => deleteItem.mutate(id)}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## Select with grouped options

```tsx
<Select value={value} onValueChange={onChange}>
  <SelectTrigger className="w-48"><SelectValue placeholder="Pick a role" /></SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>Team</SelectLabel>
      <SelectItem value="admin">Admin</SelectItem>
      <SelectItem value="member">Member</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
```

For `react-hook-form`, wrap with `<Controller>` since `<Select>` is uncontrolled-via-callback (no `register()`).

## DropdownMenu (row actions)

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onSelect={() => edit(item)}>Edit</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem variant="destructive" onSelect={() => del(item)}>Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

## Sheet (side panel — desktop)

```tsx
<Sheet>
  <SheetTrigger asChild><Button variant="outline">Filters</Button></SheetTrigger>
  <SheetContent side="right">
    <SheetHeader><SheetTitle>Filter results</SheetTitle></SheetHeader>
    {/* filter UI */}
  </SheetContent>
</Sheet>
```

## Drawer (bottom sheet — mobile, swipeable)

```tsx
import { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer"

<Drawer>
  <DrawerTrigger asChild><Button>Open</Button></DrawerTrigger>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>Edit profile</DrawerTitle>
      <DrawerDescription>Update your details.</DrawerDescription>
    </DrawerHeader>
    <div className="p-4">{/* content */}</div>
    <DrawerFooter>
      <Button>Save</Button>
      <DrawerClose asChild><Button variant="outline">Cancel</Button></DrawerClose>
    </DrawerFooter>
  </DrawerContent>
</Drawer>
```

The drag handle (rounded pill) auto-renders for `direction="bottom"` (default). For side drawers, pass `direction="right"` (or left/top); the handle is hidden.

## Responsive: Dialog on desktop, Drawer on mobile

```tsx
import { useMediaQuery } from "@/hooks/use-media-query" // build with window.matchMedia

function ResponsiveModal({ open, onOpenChange, title, children }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  children: React.ReactNode
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)")

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>{title}</DrawerTitle></DrawerHeader>
        <div className="p-4 pb-8">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
```

## Tabs

```tsx
<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="activity">Activity</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">...</TabsContent>
  <TabsContent value="activity">...</TabsContent>
</Tabs>
```

## Toasts (Sonner)

Mount the `<Toaster />` once near the root of `App.tsx`. Then call `toast()` from anywhere — no Context needed.

```tsx
// App.tsx
import { Toaster } from "@/components/ui/sonner"

function App() {
  return (
    <>
      <Toaster richColors position="top-right" closeButton />
      {/* ...routes... */}
    </>
  )
}

// Anywhere:
import { toast } from "sonner"

toast.success("Item created")
toast.error("Failed to delete")
toast.warning("Cannot be undone")
toast.info("Update available")

// With description
toast.success("Saved", { description: "Your changes have been saved" })

// With undo action
toast("Item deleted", { action: { label: "Undo", onClick: () => undoDelete() } })

// Promise (loading → success/error)
toast.promise(createTask.mutateAsync(data), {
  loading: "Creating task...",
  success: "Task created!",
  error: (err) => err.message ?? "Failed to create task",
})

// Programmatic dismiss
const id = toast.loading("Processing...")
toast.dismiss(id)
```

`<Toaster richColors closeButton position="top-right" />` — common defaults. `richColors` adds semantic-colored backgrounds for success/error/warning.

## Tooltip (always wrap once at app root)

```tsx
// In App.tsx, wrap the tree:
<TooltipProvider>{children}</TooltipProvider>

// Anywhere:
<Tooltip>
  <TooltipTrigger asChild><Button size="icon"><Info /></Button></TooltipTrigger>
  <TooltipContent>Helpful hint</TooltipContent>
</Tooltip>
```

## Command palette (Cmd+K)

The `command` component covers two uses: **searchable list** inside any container, and **app-wide palette** via `CommandDialog`.

### App-wide Cmd+K palette

```tsx
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Home, Settings, FileText } from "lucide-react"
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"

function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  function run(fn: () => void) { setOpen(false); fn() }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Pages">
          <CommandItem onSelect={() => run(() => navigate("/"))}><Home /> Home</CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/settings"))}><Settings /> Settings</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(() => createNew())}><FileText /> Create new</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
```

Mount `<CommandPalette />` once near the root of `App.tsx` (outside `<Routes>`) so the shortcut works on every page.

### Searchable combobox (Command inside Popover)

```tsx
function ComboBox({ items, value, onChange }: { items: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-64 justify-between">
          {items.find(i => i.value === value)?.label ?? "Select..."}
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>Not found.</CommandEmpty>
            {items.map(item => (
              <CommandItem key={item.value} value={item.label} onSelect={() => { onChange(item.value); setOpen(false) }}>
                {value === item.value && <Check className="size-3" />}
                {item.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

## Adding components that aren't pre-built

These Radix primitives are installed but not wrapped: `accordion`, `aspect-ratio`, `collapsible`, `context-menu`, `hover-card`, `menubar`, `navigation-menu`, `progress`, `radio-group`, `scroll-area`, `slider`, `slot`, `toggle`, `toggle-group`. Wrap them yourself in `components/ui/`.

### Simple wrap

```tsx
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { cn } from "@/lib/utils"

function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("bg-primary/20 relative h-2 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}
```

### Wrap with `cva` variants

```tsx
import { cva, type VariantProps } from "class-variance-authority"

const variants = cva("base-classes", {
  variants: {
    variant: { default: "...", outline: "..." },
    size: { default: "h-9 px-4", sm: "h-8 px-3" },
  },
  defaultVariants: { variant: "default", size: "default" },
})

function Thing({ className, variant, size, ...props }: React.ComponentProps<"div"> & VariantProps<typeof variants>) {
  return <div data-slot="thing" className={cn(variants({ variant, size }), className)} {...props} />
}
```
