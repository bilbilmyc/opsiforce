import { useSortable } from "@dnd-kit/solid/sortable"
import { type Project } from "~/api/client"
import { DndType } from "~/lib/sidebar-dnd"
import ProjectCard from "./project-card"

export default function SidebarDraggableProjectRow(props: {
  project: Project
  index: number
  groupId: string
  isActive: boolean
  onSelect: () => void
  onRename: (id: string, title: string) => void
  onSettings: () => void
  onDeleted: () => void
  onDuplicated: (p: Project) => void
}) {
  const sortable = useSortable({
    get id() {
      return `proj:${props.project.id}`
    },
    get index() {
      return props.index
    },
    get group() {
      return props.groupId
    },
    type: DndType.Project,
    accept: DndType.Project,
    get data() {
      return { projectId: props.project.id }
    },
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
