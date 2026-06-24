# Styling

## Semantic colors only

Use semantic tokens (`bg-primary`, `text-muted-foreground`, `bg-card`, `text-destructive`). Never raw Tailwind colors (`bg-blue-500`, `text-gray-600`). Light/dark switching is automatic via CSS variables in `index.css`.

```tsx
// Bad
<div className="bg-blue-500 text-white">
  <p className="text-gray-600">Secondary</p>
</div>

// Good
<div className="bg-primary text-primary-foreground">
  <p className="text-muted-foreground">Secondary</p>
</div>
```

## No raw color values for status / metrics

Use `Badge` variants or semantic tokens — never `text-emerald-600`, `text-red-500`, etc.

```tsx
// Bad
<span className="text-emerald-600">+20.1%</span>
<span className="text-red-600">-3.2%</span>

// Good
<Badge variant="secondary">+20.1%</Badge>
<span className="text-destructive">-3.2%</span>
```

**Exception — multi-state status hues.** The theme ships only `--destructive`; success / warning / info have no semantic token. For status badges (Active / Pending / Failed), a fixed light + dark colour pair is the sanctioned pattern — always with the `dark:` variant so it survives dark mode: `bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400` (see the `frontend-design` skill). That is the *only* place raw colours are allowed; for metrics and deltas, stick to `Badge` / `text-destructive` above.

## Built-in variants first

If a component has a variant for what you want, use it — never hand-stack utilities.

```tsx
// Bad
<Button className="border border-input bg-transparent hover:bg-accent">Click</Button>

// Good
<Button variant="outline">Click</Button>
```

## `className` is for layout, not appearance

OK to override: spacing (`mt-4`, `mx-auto`), size (`max-w-md`), position. Not OK: colors, typography, decoration. To restyle, change `variant`, semantic token, or CSS variable.

```tsx
// Bad
<Card className="bg-blue-100 text-blue-900 font-bold">...</Card>

// Good
<Card className="max-w-md mx-auto">...</Card>
```

## No `space-x-*` / `space-y-*`

Use `gap-*` with `flex` or `grid`. `space-*` adds margin to siblings, which fails on `flex-wrap` and is wrong on the last child.

```tsx
// Bad
<div className="space-y-4">
  <Input />
  <Button>Submit</Button>
</div>

// Good
<div className="flex flex-col gap-4">
  <Input />
  <Button>Submit</Button>
</div>
```

## `size-*` over `w-* h-*` when equal

```tsx
// Bad
<AvatarImage className="w-10 h-10" />

// Good
<AvatarImage className="size-10" />
```

Applies to icons, avatars, skeletons, anything square.

## Use `truncate`, not the long form

`truncate` already means `overflow-hidden text-ellipsis whitespace-nowrap`.

## No manual `dark:` color overrides

Semantic tokens already handle both modes. If you find yourself writing `dark:bg-...`, you're using the wrong token.

```tsx
// Bad
<div className="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-50">

// Good
<div className="bg-background text-foreground">
```

## `cn()` for conditional classes

No template-literal ternaries inside `className`.

```tsx
import { cn } from "@/lib/utils"

// Bad
<div className={`flex items-center ${isActive ? "bg-primary" : "bg-muted"}`} />

// Good
<div className={cn("flex items-center", isActive ? "bg-primary" : "bg-muted")} />
```

## No manual `z-index` on overlays

`Dialog`, `Sheet`, `AlertDialog`, `DropdownMenu`, `Popover`, `Tooltip`, `HoverCard` already stack correctly via their portals. Adding `z-50` or `z-[999]` breaks the relative ordering.

## Typography niceties

- `…` not `...` — single ellipsis character, not three dots.
- Curly quotes `"` `"` and `'` `'` — not straight `"` or `'`.
- Non-breaking spaces between value and unit, in commands, and in brand names: `10 MB`, `⌘ K`, `Acme Inc`.
- Loading states end with an ellipsis: `"Loading…"`, `"Saving…"`.
- Use `font-variant-numeric: tabular-nums` (Tailwind: `tabular-nums`) for number columns and side-by-side comparisons — keeps digits aligned.
- `text-balance` (or `text-pretty`) on headings — prevents widows/orphans on multi-line titles.

## Content handling

- Long text inside narrow containers: `truncate`, `line-clamp-N`, or `break-words`. Pick one based on whether you want a single line, N lines, or a hard wrap.
- **Flex children need `min-w-0` to allow text truncation** — without it, the child's intrinsic width forces the parent wider instead of truncating. Common gotcha.
- Handle empty states explicitly. Don't render broken UI for `""`, `[]`, or `null` — show a placeholder, hint, or empty-state.
- User-generated content: design for *short, average, and very long* inputs. Test with names like "X" and "한국어로 된 매우 긴 이름".

## Hover & focus visual contrast

- Buttons and links need a `hover:` state — if the rest looks identical to the hover, the user can't tell when they're pointing at it.
- Hover / active / focus should **increase contrast** vs. rest (bolder color, brighter ring, deeper background).
