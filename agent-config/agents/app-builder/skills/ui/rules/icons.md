# Icons

The icon library for this project is **lucide-react** (pre-installed, 1500+ icons). Browse all at https://lucide.dev/icons.

## Import

```tsx
import { Plus, Trash2, Search, Loader2, ArrowRight } from "lucide-react"
```

## Don't guess icon names

Common wrong guesses:

| Guess     | Actual          |
| --------- | --------------- |
| `Memory`  | `MemoryStick`   |
| `Error`   | `AlertCircle`   |
| `Refresh` | `RefreshCw`     |
| `Close`   | `X`             |
| `Delete`  | `Trash2`        |
| `Add`     | `Plus`          |
| `Edit`    | `Pencil` (or `SquarePen`) |

## Catalog by use case

**Actions:** `Plus`, `Trash2`, `Pencil`, `Save`, `Send`, `Download`, `Upload`, `Copy`, `RefreshCw`, `MoreHorizontal`, `ExternalLink`

**Navigation:** `Home`, `ArrowLeft`, `ArrowRight`, `ChevronRight`, `ChevronDown`, `ChevronUp`, `ChevronsUpDown`, `Menu`, `X`, `LogOut`

**Status:** `Check`, `CheckCircle`, `XCircle`, `AlertCircle`, `Info`, `Loader2`, `Clock`, `Zap`

**Content:** `FileText`, `Image`, `Folder`, `Database`, `Layout`, `Tag`, `Globe`, `Lock`

**Communication:** `Mail`, `Phone`, `Bell`, `MessageSquare`

**User:** `User`, `Users`, `Settings`, `Star`, `Heart`, `Eye`, `EyeOff`

**Data:** `Search`, `Filter`, `SortAsc`, `SortDesc`, `Calendar`, `BarChart3`, `TrendingUp`

## Icons inside components: `data-icon`, no sizing

`Button`, `DropdownMenuItem`, `Alert`, `CommandItem`, `SelectItem`, `Tabs`, etc. handle icon sizing via their own CSS rules (`[&_svg:not([class*='size-'])]:size-4`). Don't add `size-4`, `w-4 h-4`, or `mr-2` — they fight the component defaults.

For icons inside a `Button`, add `data-icon="inline-start"` (prefix) or `data-icon="inline-end"` (suffix) for semantic positioning.

```tsx
// Bad
<Button>
  <SearchIcon className="mr-2 size-4" />
  Search
</Button>

<DropdownMenuItem>
  <SettingsIcon className="mr-2 size-4" />
  Settings
</DropdownMenuItem>

// Good
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

<Button>
  Next
  <ArrowRightIcon data-icon="inline-end" />
</Button>

<DropdownMenuItem>
  <SettingsIcon />
  Settings
</DropdownMenuItem>
```

## Standalone icons: use `size-*` and semantic colors

Outside of a styled component, size with `size-*` (not `w-N h-N`) and color with semantic tokens (not raw Tailwind colors).

```tsx
// Loading spinner
<Loader2 className="size-4 animate-spin" />

// Status — semantic, not raw colors
{status === "active"
  ? <CheckCircle className="size-4 text-primary" />
  : <XCircle className="size-4 text-destructive" />}

// Icon-only button (uses Button's own size variant — no className needed on the icon)
<Button size="icon" variant="ghost">
  <Plus />
</Button>

// Empty state
<div className="flex flex-col items-center py-16">
  <Inbox className="size-12 text-muted-foreground mb-4" />
  <p className="text-muted-foreground">No items yet</p>
</div>
```

## Accessibility: `aria-label` and `aria-hidden`

Icon-only buttons need an `aria-label`; decorative icons beside text need `aria-hidden="true"`. Full rules and examples in `accessibility.md`.

## Pass icons as component values, not string keys

Don't build lookup maps from string keys to icon components — kills tree-shaking.

```tsx
// Bad
const iconMap = { check: CheckIcon, alert: AlertIcon }
function StatusBadge({ icon }: { icon: string }) {
  const Icon = iconMap[icon]
  return <Icon />
}
<StatusBadge icon="check" />

// Good
function StatusBadge({ icon: Icon }: { icon: React.ComponentType }) {
  return <Icon />
}
<StatusBadge icon={CheckIcon} />
```
