---
name: carousel
description: Build carousels, sliders, and image galleries with Embla Carousel (pre-installed). Use for image galleries, testimonial sliders, product showcases, onboarding flows, or any horizontally scrollable content.
---

# Embla Carousel

`embla-carousel-react` is pre-installed. No need to `bun add`.

## Basic carousel

```tsx
import useEmblaCarousel from "embla-carousel-react"
import { useCallback } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

function Carousel({ items }: { items: { id: number; image: string; title: string }[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true })

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi])
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi])

  return (
    <div className="relative">
      <div ref={emblaRef} className="overflow-hidden rounded-lg">
        <div className="flex">
          {items.map((item) => (
            <div key={item.id} className="flex-[0_0_100%] min-w-0 px-1">
              <img src={item.image} alt={item.title} className="w-full h-64 object-cover rounded-lg" />
              <p className="text-sm font-medium mt-2 text-center">{item.title}</p>
            </div>
          ))}
        </div>
      </div>
      <Button size="icon" variant="outline" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80" onClick={scrollPrev}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="outline" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80" onClick={scrollNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
```

## Multi-item carousel (cards)

```tsx
const [emblaRef] = useEmblaCarousel({ loop: false, align: "start" })

<div ref={emblaRef} className="overflow-hidden">
  <div className="flex gap-4">
    {items.map((item) => (
      <div key={item.id} className="flex-[0_0_33.333%] min-w-0">
        <Card>{/* card content */}</Card>
      </div>
    ))}
  </div>
</div>
```

Adjust `flex-[0_0_X%]` for items per view: `100%` = 1, `50%` = 2, `33.333%` = 3. Use responsive classes: `flex-[0_0_100%] md:flex-[0_0_33.333%]`.

## Dot indicators

```tsx
import { useState, useEffect, useCallback } from "react"

function useDotNavigation(emblaApi: ReturnType<typeof useEmblaCarousel>[1]) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([])

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelectedIndex(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    setScrollSnaps(emblaApi.scrollSnapList())
    emblaApi.on("select", onSelect)
    onSelect()
  }, [emblaApi, onSelect])

  return { selectedIndex, scrollSnaps }
}

// Usage
const { selectedIndex, scrollSnaps } = useDotNavigation(emblaApi)

<div className="flex justify-center gap-1.5 mt-4">
  {scrollSnaps.map((_, i) => (
    <button
      key={i}
      onClick={() => emblaApi?.scrollTo(i)}
      className={cn("h-2 w-2 rounded-full transition-colors", i === selectedIndex ? "bg-primary" : "bg-muted")}
    />
  ))}
</div>
```

## Auto-play

```bash
cd /workspace/app && bun add embla-carousel-autoplay
```

```tsx
import Autoplay from "embla-carousel-autoplay"

const [emblaRef] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: 4000, stopOnInteraction: true })])
```

## Common mistakes

1. **Missing `min-w-0`** on slide items — without it, flex items won't shrink below content width.
2. **Forgetting `overflow-hidden`** on the embla ref container — slides will be visible outside the viewport.
3. **Not using `useCallback`** for scroll functions — prevents unnecessary re-renders.
