---
name: lucide-icons
description: Use Lucide React icons. Use whenever you need an icon in the UI — buttons, navigation, status indicators, decorative elements. Over 1500 icons available.
---

# Lucide React Icons

## Import and use

```tsx
import { Plus, Trash2, Edit, Search, Home, X, Check, Loader2, ArrowLeft } from "lucide-react"
```

**IMPORTANT:** Do NOT guess icon names. If unsure, run `cd /workspace/app && grep "export {" node_modules/lucide-react/dist/esm/icons/index.js | head -1` to check available names.

Common wrong guesses: `Memory` → `MemoryStick`, `Error` → `AlertCircle`, `Refresh` → `RefreshCw`, `Close` → `X`, `Delete` → `Trash2`, `Add` → `Plus`.

## Sizing

```tsx
<Plus className="h-4 w-4" />   // small — in buttons, badges, table cells
<Plus className="h-5 w-5" />   // medium — in navigation, sidebar
<Plus className="h-8 w-8" />   // large — in cards, hero sections, empty states
<Plus className="h-12 w-12" /> // XL — in empty states, onboarding
```

## Icons by category

**Actions:** `Plus`, `Trash2`, `Edit`, `Save`, `Send`, `Download`, `Upload`, `Copy`, `RefreshCw`, `MoreHorizontal`, `ExternalLink`

**Navigation:** `Home`, `ArrowLeft`, `ArrowRight`, `ChevronRight`, `ChevronDown`, `ChevronUp`, `Menu`, `X`, `LogOut`

**Status:** `Check`, `CheckCircle`, `XCircle`, `AlertCircle`, `Info`, `Loader2`, `Clock`, `Zap`

**Content:** `FileText`, `Image`, `Folder`, `Database`, `Layout`, `Tag`, `Globe`, `Lock`

**Communication:** `Mail`, `Phone`, `Bell`, `MessageSquare`

**User:** `User`, `Users`, `Settings`, `Star`, `Heart`, `Eye`, `EyeOff`

**Data:** `Search`, `Filter`, `SortAsc`, `SortDesc`, `Calendar`, `BarChart3`, `TrendingUp`

## Common patterns

```tsx
// Button with icon
<Button><Plus className="h-4 w-4 mr-1" /> Add Item</Button>

// Icon-only button
<Button size="icon" variant="ghost"><Plus className="h-4 w-4" /></Button>

// Loading spinner
<Loader2 className="h-4 w-4 animate-spin" />

// Status indicator
{status === "active" ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}

// Empty state
<div className="flex flex-col items-center py-16">
  <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
  <p className="text-muted-foreground">No items yet</p>
</div>
```

Browse all: https://lucide.dev/icons
