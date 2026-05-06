# Accessibility & Interaction

Cross-cutting rules for keyboard, focus, motion, touch, hydration, and content. Adapted from the Vercel Web Interface Guidelines.

## Semantic HTML before ARIA

Reach for the right element first; fall back to ARIA only when no native element fits.

- `<button>` for actions, `<a>` / `<Link>` for navigation. **Never** `<div onClick>` — breaks Cmd-click, middle-click, keyboard focus, screen readers.
- `<label>` (or `aria-label`) on every form control.
- `<table>` for tabular data, `<nav>` for navigation, `<main>` for the page's primary content.
- Headings hierarchical `<h1>` → `<h6>`. One `<h1>` per page. Don't skip levels.

## Focus states

- Every interactive element needs a visible focus indicator. Default to `focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2` (or rely on shadcn components, which already do this).
- **Never** `outline-none` / `outline: none` without a focus replacement.
- Prefer `:focus-visible` over `:focus` — don't show focus rings on click, only on keyboard.
- Use `:focus-within` for compound controls (e.g. an input + button group).

## Icon-only buttons need `aria-label`

```tsx
// Good
<Button size="icon" variant="ghost" aria-label="Delete item">
  <Trash2 />
</Button>

// Bad — screen reader announces nothing meaningful
<Button size="icon" variant="ghost"><Trash2 /></Button>
```

## Decorative icons need `aria-hidden`

If the icon sits next to text that already conveys the meaning, hide it from assistive tech:

```tsx
<Button>
  <Plus data-icon="inline-start" aria-hidden="true" />
  Add item
</Button>
```

The text "Add item" already conveys the action. The icon is decoration.

## Animation

- **Honor `prefers-reduced-motion`** — wrap motion variants or set `motion-reduce:transition-none motion-reduce:animate-none` on animated elements.
- Animate **`transform` and `opacity` only** — they're compositor-friendly. Avoid animating `width`, `height`, `top`, `left`, etc. on the hot path.
- **Never `transition: all`** — list properties explicitly (`transition-[color,box-shadow]`).
- Set the right `transform-origin` (e.g. `origin-top` for a dropdown menu sliding from a top trigger).
- Animations should be **interruptible** — if a user clicks again mid-animation, respond to the new input rather than waiting.

## Hover & active states

- Buttons and links need a visible `hover:` state.
- Hover/active/focus should **increase contrast** vs. rest — bolder color, ring, or darker background.

## Touch & mobile

- `touch-action: manipulation` on tappable elements (prevents the 300ms double-tap zoom delay).
- `overscroll-behavior: contain` on modals, drawers, and sheets — stops the page underneath from scrolling when the overlay is at its bounds.
- Use `autoFocus` **sparingly**. Acceptable on a single primary input on a desktop form. Avoid on mobile (pops the keyboard immediately, can be hostile).
- During drag operations, disable text selection and apply `inert` to the dragged element so it doesn't catch pointer events.

## Safe areas (full-bleed layouts)

Modern phones have notches and home bars. For full-bleed layouts:

```css
.app-shell {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
```

Avoid unwanted scrollbars on outer containers — fix the content overflow rather than masking with `overflow-x-hidden`.

## Images

- `<img>` needs explicit `width` and `height` attributes — prevents layout shift (CLS).
- Below-fold images: `loading="lazy"`.
- Above-fold critical images: `fetchpriority="high"`.
- Decorative images: `alt=""` (empty, not omitted). Meaningful images: descriptive `alt`.

## Async updates / live regions

Toasts (Sonner already handles this), validation messages, and other async UI changes need `aria-live="polite"` so screen readers announce them. Critical updates (form submission errors) can use `aria-live="assertive"`, sparingly.

## Hydration safety

- Inputs with `value` need `onChange` (or use `defaultValue` for uncontrolled).
- Date / time / locale rendering: guard against server-vs-client mismatch — `Intl.DateTimeFormat` with a fixed locale, or render after mount.
- `suppressHydrationWarning` only where truly needed (e.g. a date that's intentionally "now" on each render).

## Performance

- Large lists (>50 items): virtualize. Use the `virtual-list` skill or `content-visibility: auto`.
- No layout reads in render (`getBoundingClientRect`, `offsetHeight`, `scrollTop`). Push to `useEffect` or `useLayoutEffect`.
- Batch DOM reads/writes; avoid interleaving (causes forced reflow).
- Prefer uncontrolled inputs for high-frequency keystroke updates; controlled inputs must be cheap per keystroke.

## Locale & i18n

- Dates / times: `Intl.DateTimeFormat`, not hardcoded format strings.
- Numbers / currency: `Intl.NumberFormat`.
- Detect language via `navigator.languages`, not IP.
- Brand names, code tokens, identifiers: wrap with `translate="no"` to prevent garbled auto-translation.

## Anti-patterns to flag

- `user-scalable=no` or `maximum-scale=1` (disabling zoom — hostile to low-vision users)
- `onPaste` with `preventDefault` (blocks paste — hostile to password managers, accessibility)
- `transition: all`
- `outline-none` without focus-visible replacement
- `<div>` / `<span>` with click handlers (should be `<button>`)
- Images without `width` / `height`
- Large arrays `.map()` without virtualization
- Form inputs without labels
- Icon buttons without `aria-label`
- Hardcoded date/number formats (use `Intl.*`)
- `autoFocus` without clear justification
