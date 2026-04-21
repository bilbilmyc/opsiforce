import { splitProps, type JSX, type ParentProps } from "solid-js"
import { cn } from "~/lib/cn"

export function DialogHeader(
  props: ParentProps<JSX.HTMLAttributes<HTMLDivElement>>,
) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div
      class={cn(
        "flex flex-col space-y-1.5 text-left",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </div>
  )
}
