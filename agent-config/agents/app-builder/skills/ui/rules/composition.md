# Composition

## Items always live inside their Group

Never render items directly inside the content container.

```tsx
// Bad
<SelectContent>
  <SelectItem value="apple">Apple</SelectItem>
</SelectContent>

// Good
<SelectContent>
  <SelectGroup>
    <SelectItem value="apple">Apple</SelectItem>
  </SelectGroup>
</SelectContent>
```

| Item                                          | Group                  |
| --------------------------------------------- | ---------------------- |
| `SelectItem`, `SelectLabel`                   | `SelectGroup`          |
| `DropdownMenuItem`, `DropdownMenuLabel`, sub  | `DropdownMenuGroup`    |
| `CommandItem`                                 | `CommandGroup`         |

## Dialog / Sheet / AlertDialog need a Title

Required by Radix for screen readers. Use `className="sr-only"` if the design hides the title visually. Same applies to `*Description` — omit by wrapping it in `sr-only` if not visible.

```tsx
<DialogContent>
  <DialogHeader>
    <DialogTitle>Edit profile</DialogTitle>
    <DialogDescription>Update your details.</DialogDescription>
  </DialogHeader>
  ...
</DialogContent>
```

## Card uses full composition

Don't dump everything into `CardContent`.

```tsx
<Card>
  <CardHeader>
    <CardTitle>Team Members</CardTitle>
    <CardDescription>Manage your team.</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>
    <Button>Invite</Button>
  </CardFooter>
</Card>
```

## `Button` has no `isPending` / `isLoading` prop

Compose with `disabled` + a spinner icon.

```tsx
import { Loader2 } from "lucide-react"

<Button disabled={mutation.isPending}>
  {mutation.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
  {mutation.isPending ? "Saving..." : "Save"}
</Button>
```

## `TabsTrigger` must be inside `TabsList`

Never render `TabsTrigger` directly under `Tabs`.

```tsx
<Tabs defaultValue="account">
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="password">Password</TabsTrigger>
  </TabsList>
  <TabsContent value="account">...</TabsContent>
</Tabs>
```

## `Avatar` always needs `AvatarFallback`

Image loads can fail. Always provide initials or a fallback icon.

```tsx
<Avatar>
  <AvatarImage src="/avatar.png" alt="Jane Doe" />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>
```

## Use existing components, not custom markup

| Instead of                                              | Use                                          |
| ------------------------------------------------------- | -------------------------------------------- |
| `<hr>` or `<div className="border-t">`                  | `<Separator />`                              |
| `<div className="animate-pulse bg-...">`                | `<Skeleton className="h-4 w-3/4" />`         |
| `<span className="rounded-full bg-green-100 ...">`      | `<Badge variant="secondary">`                |
| Custom toast / notification component                   | `<Toaster />` from `@/components/ui/sonner` (mount once); call `toast()` from sonner anywhere |

## Choosing overlay components

| Use case                                    | Component       |
| ------------------------------------------- | --------------- |
| Focused task that requires input            | `Dialog`        |
| Destructive-action confirmation             | `AlertDialog`   |
| Side panel with details / filters (desktop) | `Sheet`         |
| Mobile-first bottom sheet (swipeable)       | `Drawer`        |
| Quick info on hover                         | `HoverCard`*    |
| Small contextual content on click           | `Popover`       |
| Cmd+K search palette                        | `CommandDialog` |
| Toast notification                          | `Toaster` + `toast()` from sonner |

\* `HoverCard` Radix primitive is installed — wrap it yourself in `components/ui/` using the same pattern as `popover.tsx`.

**Sheet vs Drawer**: both are "panel that slides in." Pick `Sheet` when the design is desktop-first (filters, settings, secondary nav). Pick `Drawer` when it's mobile-first or needs swipe-to-dismiss (mobile checkout step, bottom action sheet). For a single component that's both, see the **Responsive Modal** recipe in `SKILL.md`.

## Choosing form controls

Full "Choosing a control" table (Input / Textarea / Select / combobox / Switch / Checkbox / RadioGroup / ToggleGroup / OTP / date) is in `forms.md`.

## URL reflects significant state

Filters, tabs, pagination, expanded panels, sort order — anything a user might want to share, refresh, or back-button-out-of — belongs in the URL, not just `useState`. Default the rule: **if it changes the screen meaningfully, sync it to query params.**

```tsx
// Bad — refresh loses the filter
const [status, setStatus] = useState("active")

// Good — URL holds the state
const [params, setParams] = useSearchParams()
const status = params.get("status") ?? "active"
const setStatus = (v: string) => setParams(p => { p.set("status", v); return p })
```

Use `react-router`'s `useSearchParams` or a query-state library (e.g. `nuqs`).

## Destructive actions: confirm or undo, never immediate

Two acceptable patterns — pick one based on undo cost:

- **Confirm before**: show an `AlertDialog` for actions that are expensive to undo (delete account, drop table).
- **Undo after**: perform optimistically, show a toast with an "Undo" action — best for low-stakes deletes (delete row, archive item) where the friction of a confirmation dialog is worse than the rare undo.

```tsx
// Undo pattern with sonner
toast("Item deleted", {
  action: { label: "Undo", onClick: () => restore(item) },
  duration: 5000,
})
```

Never silently delete with no recovery path.

## `asChild` rule (radix triggers)

Triggers and close buttons accept `asChild` to *replace* the rendered element with their child. Use it to keep DOM flat — never wrap in extra divs.

```tsx
// Good — Button becomes the trigger
<DialogTrigger asChild><Button>Open</Button></DialogTrigger>

// Bad — extra div breaks Radix's keyboard/focus wiring
<DialogTrigger><div><Button>Open</Button></div></DialogTrigger>
```

`asChild` requires *exactly one* React element child. Multiple children → React error.

Components that take `asChild`: `DialogTrigger`, `SheetTrigger`, `AlertDialogTrigger`, `DropdownMenuTrigger`, `PopoverTrigger`, `TooltipTrigger`, `DialogClose`, `SheetClose`, `Button` (when wrapping `<a>`).
