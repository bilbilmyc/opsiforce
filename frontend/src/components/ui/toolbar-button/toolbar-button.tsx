import { splitProps, Show, type JSX, type ParentProps } from "solid-js"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "~/lib/cn"
import { Tooltip, TooltipTrigger, TooltipContent } from "~/components/ui/tooltip"

const toolbarButtonVariants = cva(
  "inline-flex items-center justify-center rounded transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      size: {
        sm: "w-6 h-6",
        md: "w-7 h-7",
      },
      tone: {
        muted: "text-muted-foreground hover:bg-accent hover:text-foreground",
        sidebar: "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
      },
    },
    defaultVariants: {
      size: "sm",
      tone: "muted",
    },
  },
)

type ToolbarButtonProps = ParentProps<
  JSX.ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof toolbarButtonVariants> & {
      tooltip?: string
    }
>

export function ToolbarButton(props: ToolbarButtonProps) {
  const [local, rest] = splitProps(props, [
    "class",
    "size",
    "tone",
    "tooltip",
    "children",
    "aria-label",
  ])

  const buttonClass = () =>
    cn(toolbarButtonVariants({ size: local.size, tone: local.tone }), local.class)
  const label = () => local["aria-label"] ?? local.tooltip

  return (
    <Show
      when={local.tooltip}
      fallback={
        <button class={buttonClass()} aria-label={label()} {...rest}>
          {local.children}
        </button>
      }
    >
      <Tooltip>
        <TooltipTrigger
          as="button"
          class={buttonClass()}
          aria-label={label()}
          {...rest}
        >
          {local.children}
        </TooltipTrigger>
        <TooltipContent>{local.tooltip}</TooltipContent>
      </Tooltip>
    </Show>
  )
}
