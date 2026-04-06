---
name: react-table
description: Build data tables with @tanstack/react-table — column definitions, sorting, filtering, pagination. Use when displaying tabular data, building admin panels, or showing lists with sorting/filtering.
---

# TanStack React Table

## Basic table with sorting

```tsx
import { useState } from "react"
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender, type ColumnDef, type SortingState } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react"

interface Item { id: number; title: string; status: string; createdAt: string }

const columns: ColumnDef<Item>[] = [
  {
    accessorKey: "title",
    header: ({ column }) => (
      <button className="flex items-center gap-1" onClick={() => column.toggleSorting()}>
        Title <ArrowUpDown className="h-3 w-3" />
      </button>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <Badge variant={row.getValue("status") === "active" ? "default" : "secondary"}>{row.getValue("status")}</Badge>,
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => format(parseISO(row.getValue("createdAt")), "PP"),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" onClick={() => onEdit(row.original)}>
          <Edit className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => onDelete(row.original.id)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    ),
  },
]

function DataTable({ data }: { data: Item[] }) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  })

  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id} className="border-b bg-muted/50">
              {hg.headers.map(h => (
                <th key={h.id} className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">No results.</td></tr>
          ) : (
            table.getRowModel().rows.map(row => (
              <tr key={row.id} className="border-b hover:bg-muted/50 transition-colors">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-4 py-3 text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
```

## Client-side filtering

```tsx
import { getFilteredRowModel, type ColumnFiltersState } from "@tanstack/react-table"

const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  onSortingChange: setSorting,
  onColumnFiltersChange: setColumnFilters,
  state: { sorting, columnFilters },
})

// Filter input
<Input
  placeholder="Search titles..."
  value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
  onChange={(e) => table.getColumn("title")?.setFilterValue(e.target.value)}
  className="max-w-sm"
/>
```

## Client-side pagination

```tsx
import { getPaginationRowModel } from "@tanstack/react-table"

const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  state: { sorting },
  initialState: { pagination: { pageSize: 10 } },
})

// Pagination controls
<div className="flex items-center justify-between px-4 py-3">
  <p className="text-sm text-muted-foreground">
    {table.getFilteredRowModel().rows.length} total rows
  </p>
  <div className="flex items-center gap-2">
    <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
      Previous
    </Button>
    <span className="text-sm">
      Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
    </span>
    <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
      Next
    </Button>
  </div>
</div>
```

## Row selection

```tsx
import { type RowSelectionState } from "@tanstack/react-table"

const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

// Add a select column
const selectColumn: ColumnDef<Item> = {
  id: "select",
  header: ({ table }) => (
    <input type="checkbox" checked={table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} />
  ),
  cell: ({ row }) => (
    <input type="checkbox" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
  ),
}

const table = useReactTable({
  data,
  columns: [selectColumn, ...columns],
  getCoreRowModel: getCoreRowModel(),
  onRowSelectionChange: setRowSelection,
  state: { rowSelection },
})

// Get selected rows
const selectedRows = table.getFilteredSelectedRowModel().rows.map(r => r.original)
```

## Common mistakes

1. **Forgetting `getCoreRowModel`** — required for every table, even with other row models.
2. **Putting `useState` initial values in `useReactTable`** — sorting/filter state must be managed via `useState` + `onXChange` + `state`, not just `initialState` (if you need to control it).
3. **Empty state** — always handle `rows.length === 0` or the table renders with no visible feedback.
