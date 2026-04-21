import { splitProps, type JSX, type ParentProps } from "solid-js"
import { cn } from "~/lib/cn"

export function TableHeader(
  props: ParentProps<JSX.HTMLAttributes<HTMLTableSectionElement>>,
) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <thead class={cn("[&_tr]:border-b bg-muted/40", local.class)} {...rest}>
      {local.children}
    </thead>
  )
}
