import { useSortable } from "@dnd-kit/solid/sortable"
import { type Project } from "~/api/client"
import { DndType } from "~/lib/sidebar-dnd"
import ProjectCard from "./project-card"

/**
 * Project row that's draggable (if the caller has permission) or a plain
 * ProjectCard (if not). Wrapping the non-draggable case keeps callers from
 * branching on permission themselves.
 */
export default function SidebarDraggableProjectRow(props: {
  project: Project
  index: number
  groupId: string
  isActive: boolean
  draggable: boolean
  onSelect: () => void
  onRename: (id: string, title: string) => void
  onSettings: () => void
  onDeleted: () => void
  onDuplicated: (p: Project) => void
}) {
  if (!props.draggable) {
    return (
      <ProjectCard
        project={props.project}
        isActive={props.isActive}
        onSelect={props.onSelect}
        onRename={props.onRename}
        onSettings={props.onSettings}
        onDeleted={props.onDeleted}
        onDuplicated={props.onDuplicated}
      />
    )
  }

  const sortable = useSortable({
    id: `proj:${props.project.id}`,
    index: props.index,
    group: props.groupId,
    type: DndType.Project,
    accept: DndType.Project,
    data: { projectId: props.project.id },
  })

  return (
    <div ref={sortable.ref} style={{ opacity: sortable.isDragging() ? 0.5 : 1 }}>
      <ProjectCard
        project={props.project}
        isActive={props.isActive}
        onSelect={props.onSelect}
        onRename={props.onRename}
        onSettings={props.onSettings}
        onDeleted={props.onDeleted}
        onDuplicated={props.onDuplicated}
      />
    </div>
  )
}
