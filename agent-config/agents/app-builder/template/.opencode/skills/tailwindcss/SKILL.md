---
name: tailwindcss
description: Tailwind CSS v4 theme system — color tokens, dark mode, responsive breakpoints, animations. Use when customizing the app theme (colors, brand), configuring dark mode, working with the OKLCH color variables in index.css, or needing the correct semantic token classes (bg-primary, text-muted-foreground, etc). For UI components use shadcn skill instead.
---

# Tailwind CSS v4 — Project Theme System

This project uses **Tailwind v4 with CSS-first configuration**. No `tailwind.config.js` — everything is in `index.css` via `@theme inline`.

## Theme Architecture

Colors are OKLCH CSS variables in `:root` (light) and `.dark` (dark). Tailwind maps them via `@theme inline`.

### How it works

```css
/* index.css structure */
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --primary: oklch(0.205 0 0);         /* CSS variable */
}

@theme inline {
  --color-primary: var(--primary);      /* Tailwind picks this up → bg-primary, text-primary */
  --radius-lg: var(--radius);           /* → rounded-lg */
}
```

### Customizing the theme for a new app

Edit `:root` variables in `frontend/src/index.css`. To give the app a brand color, change `--primary` and `--primary-foreground`:

```css
:root {
  --primary: oklch(0.55 0.2 250);           /* blue brand */
  --primary-foreground: oklch(0.985 0 0);   /* white text on blue */
}
.dark {
  --primary: oklch(0.65 0.22 250);          /* lighter blue for dark mode */
  --primary-foreground: oklch(0.1 0 0);     /* dark text */
}
```

OKLCH format: `oklch(lightness chroma hue)` — lightness 0-1, chroma 0-0.4 (saturation), hue 0-360 (color wheel).

## Complete Color Token Reference

**ALWAYS use semantic tokens. NEVER use raw colors like `bg-white`, `bg-gray-900`, `text-black`.**

| Token | Tailwind class | Purpose |
|---|---|---|
| **Page** | `bg-background` / `text-foreground` | Main page background + text |
| **Cards** | `bg-card` / `text-card-foreground` | Card/panel surfaces |
| **Popover** | `bg-popover` / `text-popover-foreground` | Dropdown menus, popovers |
| **Primary** | `bg-primary` / `text-primary-foreground` | Primary buttons, CTAs |
| **Secondary** | `bg-secondary` / `text-secondary-foreground` | Secondary buttons |
| **Muted** | `bg-muted` / `text-muted-foreground` | Disabled elements, hints |
| **Accent** | `bg-accent` / `text-accent-foreground` | Highlights, hover states |
| **Destructive** | `bg-destructive` / `text-destructive-foreground` | Delete buttons, errors |
| **Borders** | `border-border` | General borders |
| **Inputs** | `border-input` | Form input borders |
| **Focus** | `ring-ring` | Focus rings |
| **Charts** | `text-chart-1` through `text-chart-5` | Chart colors (also `fill-chart-1`, `stroke-chart-1`) |

### Sidebar tokens (for apps with sidebar navigation)

| Token | Class | Purpose |
|---|---|---|
| `--sidebar` | `bg-sidebar` | Sidebar background |
| `--sidebar-foreground` | `text-sidebar-foreground` | Sidebar text |
| `--sidebar-primary` | `bg-sidebar-primary` | Active sidebar item |
| `--sidebar-accent` | `bg-sidebar-accent` | Hover state in sidebar |
| `--sidebar-border` | `border-sidebar-border` | Sidebar border |

## Border Radius

Uses `--radius` variable (default `0.625rem`). Sizes are computed:

| Class | Value |
|---|---|
| `rounded-sm` | `calc(var(--radius) - 4px)` = 0.375rem |
| `rounded-md` | `calc(var(--radius) - 2px)` = 0.5rem |
| `rounded-lg` | `var(--radius)` = 0.625rem |
| `rounded-xl` | `calc(var(--radius) + 4px)` = 0.875rem |

## Dark Mode

Toggle with `next-themes` (pre-installed):

```tsx
import { useTheme } from "next-themes"

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      <Sun className="h-4 w-4 dark:hidden" />
      <Moon className="h-4 w-4 hidden dark:block" />
    </Button>
  )
}
```

No need for `dark:` prefixes on semantic tokens — they auto-switch. Only use `dark:` for non-token values like `dark:hidden`.

## Animations (tw-animate-css)

Pre-installed animation classes:

```tsx
<div className="animate-in fade-in duration-300">              {/* fade in */}
<div className="animate-in fade-in slide-in-from-bottom-4">    {/* fade + slide up */}
<div className="animate-in zoom-in-95">                         {/* scale in */}
<div className="animate-out fade-out slide-out-to-top-2">      {/* exit animation */}
```

Composable: combine `fade-in` + `slide-in-from-*` + `zoom-in-*` with `duration-*` and `delay-*`.

Directions: `slide-in-from-top`, `slide-in-from-bottom`, `slide-in-from-left`, `slide-in-from-right` (with `-N` suffix for distance).

## Using chart colors in inline styles

For Recharts and SVG, use `hsl(var(--chart-N))` or `oklch(var(--chart-N))`:

```tsx
<Bar fill="hsl(var(--chart-1))" />
```

In Tailwind classes: `text-chart-1`, `bg-chart-1`, `fill-chart-1`, `stroke-chart-1`.

## Common Mistakes

1. **Using `bg-white` / `bg-gray-*` / `text-black`** — breaks dark mode. Always use semantic tokens: `bg-background`, `bg-card`, `text-foreground`.
2. **Using `bg-primary/90` for hover** — correct! Use opacity modifiers for hover states: `bg-primary hover:bg-primary/90`.
3. **Forgetting `text-foreground` on the root** — the `<body>` or root container should have `bg-background text-foreground`.
4. **Using `next-themes` without checking mount** — `theme` is undefined during SSR/hydration. Use `mounted` state or `resolvedTheme`.
5. **Adding `tailwind.config.js`** — not needed in v4. All config is in `index.css` via `@theme inline`.
