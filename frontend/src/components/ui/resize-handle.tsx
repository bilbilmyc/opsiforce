import type { JSX } from "solid-js"
import { cn } from "~/lib/cn"

export function ResizeHandle(props: {
  onPointerDown: (e: PointerEvent) => void
  resizing: boolean
  position: "left" | "right"
  class?: string
}): JSX.Element {
  return (
    <>
      <div
        onPointerDown={props.onPointerDown}
        class={cn(
          "absolute top-0 h-full cursor-col-resize z-10 hover:bg-primary/40 active:bg-primary/60 transition-colors",
          props.position === "left"
            ? "left-0 w-1 -translate-x-1/2"
            : "right-0 w-1.5",
          props.resizing && "bg-primary/60",
          props.class,
        )}
        title="Drag to resize"
      />
      {props.resizing && (
        <div class="fixed inset-0 z-50 cursor-col-resize" />
      )}
    </>
  )
}
