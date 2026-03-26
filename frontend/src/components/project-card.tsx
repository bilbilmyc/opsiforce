import { Show } from "solid-js"
import type { Project } from "~/api/client"

const statusColors: Record<Project["status"], string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  suspended: "bg-amber-500/20 text-amber-400",
  stopped: "bg-zinc-700 text-zinc-300",
  pending: "bg-blue-500/20 text-blue-400",
  starting: "bg-blue-500/20 text-blue-400",
}

export default function ProjectCard(props: {
  project: Project
  isActive: boolean
  onSelect: () => void
  onResume: () => void
  onStop: () => void
}) {
  const title = () =>
    props.project.title ?? `Project ${new Date(props.project.createdAt).toLocaleDateString()}`

  return (
    <div
      onClick={props.onSelect}
      class={`mb-2 cursor-pointer rounded-lg border p-3 transition-colors ${
        props.isActive
          ? "border-indigo-500 bg-zinc-800"
          : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800/50"
      }`}
    >
      <div class="mb-1 flex items-center justify-between">
        <span class="text-sm font-semibold">{title()}</span>
        <span class={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[props.project.status]}`}>
          {props.project.status}
        </span>
      </div>
      <Show when={props.project.lastActiveAt}>
        <div class="text-xs text-zinc-500">
          {new Date(props.project.lastActiveAt!).toLocaleString()}
        </div>
      </Show>
      <Show when={props.project.status === "suspended"}>
        <button
          class="mt-2 w-full rounded-md border border-amber-500/50 px-3 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            props.onResume()
          }}
        >
          Resume
        </button>
      </Show>
      <Show when={props.project.status === "active"}>
        <button
          class="mt-2 w-full rounded-md border border-zinc-600 px-3 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-800 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            props.onStop()
          }}
        >
          Stop
        </button>
      </Show>
    </div>
  )
}
