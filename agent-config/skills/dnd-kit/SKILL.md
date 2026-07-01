---
name: dnd-kit
description: Add drag-and-drop functionality with @dnd-kit. Use whenever the user wants to reorder items, sort a list, build a kanban board, or any drag-to-rearrange interaction. For reordering/sorting use dnd-kit; for free-drag/swipe gestures (drag a card around, swipe-to-dismiss) use the animations skill.
---

# dnd-kit — Drag and Drop

## Sortable list (most common pattern)

```tsx
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"

interface Item { id: string; title: string }

function SortableItem({ item }: { item: Item }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-lg border bg-card p-3">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <span>{item.title}</span>
    </div>
  )
}

function SortableList() {
  const [items, setItems] = useState<Item[]>([
    { id: "1", title: "First" },
    { id: "2", title: "Second" },
    { id: "3", title: "Third" },
  ])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id)
        const newIndex = prev.findIndex((i) => i.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map((item) => <SortableItem key={item.id} item={item} />)}
        </div>
      </SortableContext>
    </DndContext>
  )
}
```

## Kanban board (multiple columns)

Columns are droppable zones (`useDroppable`); cards are the `SortableItem` from above. `over.id` on drop is either a column id (dropped on empty space) or a card id (dropped on another card) — resolve both to a column, then move the card.

```tsx
import { DndContext, type DragEndEvent, DragOverlay, type DragStartEvent, useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"

type ColumnId = "todo" | "doing" | "done"
type Columns = Record<ColumnId, Item[]>

const COLUMN_TITLES: Record<ColumnId, string> = { todo: "To Do", doing: "In Progress", done: "Done" }

function Column({ id, items }: { id: ColumnId; items: Item[] }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div className="flex-1">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">{COLUMN_TITLES[id]}</h3>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn("min-h-24 space-y-2 rounded-lg border p-2", isOver && "bg-muted/50")}
        >
          {items.map((item) => <SortableItem key={item.id} item={item} />)}
        </div>
      </SortableContext>
    </div>
  )
}

function KanbanBoard() {
  const [columns, setColumns] = useState<Columns>({
    todo: [{ id: "1", title: "First" }, { id: "2", title: "Second" }],
    doing: [{ id: "3", title: "Third" }],
    done: [],
  })
  const [activeId, setActiveId] = useState<string | null>(null)

  const columnIds = Object.keys(columns) as ColumnId[]
  const findColumn = (id: string): ColumnId | undefined =>
    columnIds.find((col) => columns[col].some((item) => item.id === id))
  const findItem = (id: string): Item | undefined =>
    columnIds.flatMap((col) => columns[col]).find((item) => item.id === id)

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const activeItemId = active.id as string
    const overId = over.id as string
    const from = findColumn(activeItemId)
    const to = columnIds.includes(overId as ColumnId) ? (overId as ColumnId) : findColumn(overId)
    if (!from || !to || from === to) return

    setColumns((prev) => {
      const item = prev[from].find((i) => i.id === activeItemId)
      if (!item) return prev
      return {
        ...prev,
        [from]: prev[from].filter((i) => i.id !== activeItemId),
        [to]: [...prev[to], item],
      }
    })
  }

  const activeItem = activeId ? findItem(activeId) : undefined

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4">
        {columnIds.map((id) => <Column key={id} id={id} items={columns[id]} />)}
      </div>
      <DragOverlay>{activeItem ? <SortableItem item={activeItem} /> : null}</DragOverlay>
    </DndContext>
  )
}
```

This moves a card only between different columns; to also reorder within a column, add an `arrayMove` branch when `from === to` (see the sortable list above). `useDroppable`, `cn`, and `useState` are imported from `@dnd-kit/core`, `@/lib/utils`, and `react` respectively.

## Key rules

- Every draggable item needs a unique string `id`
- Use `arrayMove` from `@dnd-kit/sortable` to reorder arrays
- `useSortable` hook provides `attributes`, `listeners`, `setNodeRef`, `transform`, `transition`
- Apply `CSS.Transform.toString(transform)` as inline style
- Use `DragOverlay` for a floating preview during drag
