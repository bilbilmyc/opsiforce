import { splitProps, type JSX, type ParentProps } from "solid-js"
import { cn } from "~/lib/cn"

export function TableRow(
  props: ParentProps<JSX.HTMLAttributes<HTMLTableRowElement>>,
) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <tr
      class={cn(
        "border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </tr>
  )
}
