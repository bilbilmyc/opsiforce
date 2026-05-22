import type { JSX } from "solid-js"
import { cn } from "~/lib/cn"

export function ResizeHandle(props: {
  onPointerDown: (e: PointerEvent) => void
  resizing: boolean
  position: "left" | "right"
  class?: string
}): JSX.Element {
  return (
    <div
      onPointerDown={props.onPointerDown}
      class={cn(
        "group absolute top-0 h-full w-2 cursor-col-resize touch-none select-none z-10",
        props.position === "left" ? "left-0" : "right-0",
        props.class,
      )}
      title="Drag to resize"
    >
      <div
        class={cn(
          "absolute inset-y-0 w-px transition-colors group-hover:bg-primary/60 group-active:bg-primary",
          props.position === "left" ? "left-0" : "right-0",
          props.resizing && "bg-primary",
        )}
      />
    </div>
  )
}
