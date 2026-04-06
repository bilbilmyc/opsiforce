---
name: motion-animation
description: Add animations with Motion (Framer Motion). Use for enter/exit animations, page transitions, hover effects, staggered lists, shared layout animations, scroll-triggered reveals, or any animated UI element.
---

# Motion (Framer Motion)

```tsx
import { motion, AnimatePresence, useInView } from "motion/react"
```

## Animate on mount

```tsx
<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
  Content
</motion.div>
```

## Staggered list (items appear one by one)

```tsx
const container = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }
const item = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }

<motion.div initial="hidden" animate="visible" variants={container}>
  {items.map((i) => (
    <motion.div key={i.id} variants={item} className="border rounded-lg p-4">
      {i.title}
    </motion.div>
  ))}
</motion.div>
```

## Animate list add/remove

```tsx
<AnimatePresence>
  {items.map((item) => (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
    >
      {item.title}
    </motion.div>
  ))}
</AnimatePresence>
```

**Key:** `AnimatePresence` is required for exit animations. Every child must have a unique `key`.

## Hover / tap interactions

```tsx
<motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
  Click me
</motion.button>

<motion.div whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} transition={{ duration: 0.2 }}>
  <Card>Hoverable card</Card>
</motion.div>
```

## Shared layout animation (tab indicator, expanding card)

```tsx
function Tabs({ tabs, activeTab, onChange }: { tabs: string[]; activeTab: string; onChange: (tab: string) => void }) {
  return (
    <div className="flex gap-1 relative">
      {tabs.map((tab) => (
        <button key={tab} onClick={() => onChange(tab)} className="relative px-4 py-2 text-sm">
          {tab}
          {activeTab === tab && (
            <motion.div layoutId="active-tab" className="absolute inset-0 bg-primary/10 rounded-md" transition={{ type: "spring", stiffness: 500, damping: 30 }} />
          )}
        </button>
      ))}
    </div>
  )
}
```

**Key:** `layoutId` must be the same string across renders. Motion will smoothly animate between positions.

## Scroll-triggered animation (reveal on scroll)

```tsx
import { useRef } from "react"
import { motion, useInView } from "motion/react"

function ScrollReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5 }}
    >
      {children}
    </motion.div>
  )
}
```

## Page route transitions

```tsx
import { useLocation } from "react-router-dom"

function AnimatedOutlet() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  )
}
```

Use `<AnimatedOutlet />` in your Layout component instead of `<Outlet />`.

## Common transition presets

```tsx
// Snappy spring (buttons, tabs)
{ type: "spring", stiffness: 400, damping: 17 }

// Smooth spring (layout shifts)
{ type: "spring", stiffness: 300, damping: 30 }

// Quick ease (fade in/out)
{ duration: 0.2, ease: "easeOut" }

// Gentle ease (page transitions)
{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }
```

## Common mistakes

1. **Forgetting `AnimatePresence`** around conditional/list renders — exit animations won't play.
2. **Using `layoutId` with different DOM structures** — only works when the component stays mounted and the `layoutId` string matches.
3. **Heavy spring animations on many items** — use `duration`-based transitions for lists with 20+ items.
