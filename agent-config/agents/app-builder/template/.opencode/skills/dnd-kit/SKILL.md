---
name: dnd-kit
description: Add drag-and-drop functionality with @dnd-kit — sortable lists, kanban boards, reorderable items. Use whenever the user wants to drag things, reorder items, build a kanban board, or any drag-and-drop interaction.
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

```tsx
import { DndContext, type DragEndEvent, DragOverlay, type DragStartEvent } from "@dnd-kit/core"

function KanbanBoard() {
  const [activeId, setActiveId] = useState<string | null>(null)

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    // Move item between columns based on over.id
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4">
        <Column id="todo" title="To Do" items={todoItems} />
        <Column id="doing" title="In Progress" items={doingItems} />
        <Column id="done" title="Done" items={doneItems} />
      </div>
      <DragOverlay>{activeId ? <ItemCard item={findItem(activeId)} /> : null}</DragOverlay>
    </DndContext>
  )
}
```

## Key rules

- Every draggable item needs a unique string `id`
- Use `arrayMove` from `@dnd-kit/sortable` to reorder arrays
- `useSortable` hook provides `attributes`, `listeners`, `setNodeRef`, `transform`, `transition`
- Apply `CSS.Transform.toString(transform)` as inline style
- Use `DragOverlay` for a floating preview during drag
