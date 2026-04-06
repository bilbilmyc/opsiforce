---
name: resizable-panels
description: Create resizable panel layouts with react-resizable-panels (pre-installed). Use for split-pane views, resizable sidebars, IDE-like layouts, or any layout where users should be able to drag to resize sections.
---

# Resizable Panels

`react-resizable-panels` is pre-installed. No need to `bun add`.

## Horizontal split (sidebar + content)

```tsx
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"

function ResizableLayout() {
  return (
    <PanelGroup direction="horizontal" className="h-screen">
      <Panel defaultSize={25} minSize={15} maxSize={40}>
        <aside className="h-full border-r p-4 overflow-y-auto">
          <h2 className="text-sm font-semibold mb-4">Sidebar</h2>
          {/* sidebar content */}
        </aside>
      </Panel>
      <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/20 transition-colors cursor-col-resize" />
      <Panel defaultSize={75}>
        <main className="h-full p-6 overflow-y-auto">
          {/* main content */}
        </main>
      </Panel>
    </PanelGroup>
  )
}
```

## Vertical split (top + bottom)

```tsx
<PanelGroup direction="vertical" className="h-screen">
  <Panel defaultSize={60} minSize={30}>
    <div className="h-full p-4 overflow-y-auto">
      {/* Editor or main content */}
    </div>
  </Panel>
  <PanelResizeHandle className="h-1.5 bg-border hover:bg-primary/20 transition-colors cursor-row-resize" />
  <Panel defaultSize={40} minSize={15}>
    <div className="h-full p-4 overflow-y-auto">
      {/* Terminal, preview, or details */}
    </div>
  </Panel>
</PanelGroup>
```

## Three-panel layout (file tree + editor + preview)

```tsx
<PanelGroup direction="horizontal" className="h-screen">
  <Panel defaultSize={20} minSize={10} maxSize={30}>
    <div className="h-full border-r p-2 overflow-y-auto">File tree</div>
  </Panel>
  <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/20 transition-colors cursor-col-resize" />
  <Panel defaultSize={50} minSize={30}>
    <div className="h-full p-4 overflow-y-auto">Editor</div>
  </Panel>
  <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/20 transition-colors cursor-col-resize" />
  <Panel defaultSize={30} minSize={15}>
    <div className="h-full p-4 overflow-y-auto">Preview</div>
  </Panel>
</PanelGroup>
```

## Collapsible panel

```tsx
import { type ImperativePanelHandle } from "react-resizable-panels"

const sidebarRef = useRef<ImperativePanelHandle>(null)

<Panel ref={sidebarRef} defaultSize={25} minSize={0} collapsible collapsedSize={0}>
  <aside className="h-full border-r p-4">Sidebar</aside>
</Panel>

<Button onClick={() => {
  const panel = sidebarRef.current
  if (panel?.isCollapsed()) panel.expand()
  else panel?.collapse()
}}>
  Toggle Sidebar
</Button>
```

## Persist sizes (localStorage)

```tsx
<PanelGroup direction="horizontal" autoSaveId="app-layout">
  {/* Panels automatically save and restore their sizes */}
</PanelGroup>
```

`autoSaveId` persists panel sizes to localStorage automatically.

## Handle styling

```tsx
// Minimal line handle
<PanelResizeHandle className="w-px bg-border hover:w-1 hover:bg-primary/30 transition-all" />

// Handle with grip indicator
<PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/20 transition-colors cursor-col-resize flex items-center justify-center">
  <GripVertical className="h-4 w-3 text-muted-foreground" />
</PanelResizeHandle>
```

## Common mistakes

1. **No fixed height on PanelGroup** — panels need a bounded container. Use `h-screen` or `h-[calc(100vh-64px)]` (minus header).
2. **Forgetting `overflow-y-auto`** on panel content — content taller than the panel won't scroll.
3. **`minSize` too large** — if two panels have `minSize` totaling >100%, resizing breaks.
