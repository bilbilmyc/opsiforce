---
name: ui
description: Load for ANY frontend / UI / styling work. Single source of truth for shadcn/ui components (Button, Card, Input, Badge, Dialog, Sheet, Drawer, DropdownMenu, Select, Command palette, Popover, Tooltip, Tabs, Switch, Checkbox, Skeleton, Alert, Avatar + every Radix primitive), react-hook-form + zod forms, multi-step wizards, responsive app shells (desktop sidebar ↔ mobile hamburger drawer), React Router routing & URL-synced lists (filter/search/sort/pagination), Lucide icons, Tailwind v4 theming, accessibility (focus, ARIA, prefers-reduced-motion, hydration), and styling / composition / forms / icons / patterns rules. Use whenever building or modifying any user interface, form, modal, drawer, bottom sheet, menu, searchable selector, toast notification, icon, status indicator, theme color, dark-mode toggle, or any styled / interactive element.
---

# shadcn/ui

Components live in `frontend/src/components/ui/`. They're plain TSX — modify them directly. Built on Radix UI primitives (function components, no `forwardRef`, `data-slot` attributes, Tailwind v4).

## Pre-built components (import from `@/components/ui/<name>`)

**Layout & content**
- `card` — `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- `separator` — horizontal/vertical divider
- `skeleton` — loading placeholder (animated bg)
- `tabs` — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `avatar` — `Avatar`, `AvatarImage`, `AvatarFallback`

**Input**
- `button` — variants: default, destructive, outline, secondary, ghost, link; sizes: default, sm, lg, icon. Supports `asChild`
- `input` — text input
- `textarea` — multi-line input
- `label` — accessible form label (use `htmlFor`)
- `checkbox` — `Checkbox` with check icon
- `switch` — toggle on/off
- `select` — `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator`
- `badge` — variants: default, secondary, destructive, outline

**Overlays**
- `dialog` — modal — `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`
- `alert-dialog` — confirmation modal — same shape but with `AlertDialogAction` / `AlertDialogCancel`
- `sheet` — Radix-backed side panel (desktop-first) — `Sheet`, `SheetTrigger`, `SheetContent` (`side="left|right|top|bottom"`), `SheetHeader`, `SheetTitle`
- `drawer` — vaul-backed bottom sheet (mobile-first, swipeable) — `Drawer`, `DrawerTrigger`, `DrawerContent`, `DrawerHeader`, `DrawerTitle`, `DrawerDescription`, `DrawerFooter`, `DrawerClose` (supports `direction="top|right|bottom|left"`)
- `popover` — `Popover`, `PopoverTrigger`, `PopoverContent`
- `tooltip` — `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`
- `dropdown-menu` — `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuSub*`, `DropdownMenuShortcut`
- `command` — searchable list (cmdk) — `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator`, `CommandShortcut`

**Feedback**
- `alert` — `Alert`, `AlertTitle`, `AlertDescription` (variants: default, destructive)
- `sonner` — toast root — `Toaster`. Mount once at app root; call `toast()` from sonner anywhere.

## App shell & responsive navigation (multi-page apps)

An app with **two or more nav destinations** uses one **responsive App Shell**: a single component where the desktop sidebar and the mobile hamburger→`Drawer` render the **same** nav list — sidebar `hidden md:block`, hamburger `md:hidden`, so exactly one is visible at any width. A single-page app needs no nav chrome; skip the shell.

**Build the sidebar and its mobile drawer together — never apart.** Hiding a sidebar on mobile (`hidden md:block`) *without* also rendering a hamburger that opens the same nav leaves mobile users with **no navigation at all** — the most common mobile bug in generated apps. The desktop rail and the mobile menu are one unit, fed by one nav array, so they can't drift and the menu can't be forgotten.

Full recipe: **[rules/patterns.md](rules/patterns.md) → "Responsive App Shell"**. Before telling the user a multi-page app is done, open `agent-browser` at **375px** and confirm the hamburger shows and every destination opens from the drawer.

## Rules and patterns

Detail lives alongside this file — load the relevant page when generating non-trivial code:

- **[rules/styling.md](rules/styling.md)** — semantic colors, no `space-x/y`, `size-*`, no manual `z-index`, `cn()`, built-in variants first, typography niceties (curly quotes, `…`, `tabular-nums`, `text-balance`), content handling (`truncate`, `min-w-0`, empty states), hover contrast.
- **[rules/composition.md](rules/composition.md)** — items inside Groups, Dialog/Sheet/Drawer titles, Avatar fallback, `Button` has no `isPending`, choosing overlay components, URL-as-state, destructive actions need confirm or undo, `asChild`.
- **[rules/icons.md](rules/icons.md)** — `data-icon` on Button, no sizing classes inside components, Lucide catalog, `aria-label` on icon-only buttons, `aria-hidden` on decorative icons, icons as component values.
- **[rules/forms.md](rules/forms.md)** — `Label` + `htmlFor`, `aria-invalid`, control selection, gap-based stacking, `type` / `inputmode` / `autocomplete`, placeholder pattern, focus-first-error on submit, react-hook-form + zod patterns, controlled fields, mutation+toast flow, dynamic field arrays, edit forms, multi-step wizards.
- **[rules/theming.md](rules/theming.md)** — Tailwind v4 OKLCH variables, semantic token reference, brand customization, border radius, dark mode (`next-themes`), `tw-animate-css` animations, chart colors.
- **[rules/accessibility.md](rules/accessibility.md)** — semantic HTML before ARIA, focus states (`:focus-visible`), `prefers-reduced-motion`, touch (`touch-action`, `overscroll-behavior`), hydration safety, image dimensions, locale (`Intl.*`), anti-pattern checklist.
- **[rules/patterns.md](rules/patterns.md)** — worked recipes: Dialog with form, AlertDialog confirm, Select, DropdownMenu, Sheet, Drawer, Responsive Modal (Dialog↔Drawer), Responsive App Shell (sidebar + mobile drawer), Tabs, Toasts, Tooltip, Cmd+K palette, Combobox, "adding components" pattern.
- **[rules/navigation.md](rules/navigation.md)** — multi-page apps: React Router v7 routing (routes, params, nested layout routes, programmatic nav, 404), breadcrumbs, and URL-synced search / filter / sort / pagination.

## Common mistakes

1. **Forgetting `<TooltipProvider>`** — must wrap the tree once. Without it, `<Tooltip>` renders nothing.
2. **`asChild` requires exactly one child** — `<DialogTrigger asChild><Button>...</Button></DialogTrigger>`. Two children → React error.
3. **`onSelect` vs `onClick` on menu items** — Radix menu/command items fire `onSelect`. `onClick` works but doesn't auto-close the menu.
4. **`cmdk` filters by item text** — `<CommandItem value="...">` is what's matched against the input. If you render JSX inside, set `value` explicitly to control matching.
5. **Native `<select>` in forms** — for styled selects, use the `Select` component, not `<select>`. Wrap with `Controller` for `react-hook-form`.
6. **Desktop-only sidebar** — an `aside` that's `hidden md:block` with no hamburger leaves mobile with zero navigation. Sidebar + mobile drawer are one component fed by one nav list (see "App shell & responsive navigation"); verify at 375px.
