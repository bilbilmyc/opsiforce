---
name: recharts
description: Create charts and data visualizations with Recharts — bar charts, line charts, pie charts, area charts. Use whenever the user wants graphs, charts, dashboards, analytics, data visualization, or any visual representation of data.
---

# Recharts

**Rules:**
- Always wrap in `<ResponsiveContainer width="100%" height={N}>`
- Use `hsl(var(--chart-1))` through `--chart-5` for theme-aware colors
- Style tooltips to match the app theme

## Bar chart

```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"

const data = [
  { name: "Jan", sales: 400, revenue: 240 },
  { name: "Feb", sales: 300, revenue: 139 },
]

<ResponsiveContainer width="100%" height={300}>
  <BarChart data={data}>
    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
    <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
    <YAxis className="text-xs fill-muted-foreground" />
    <Tooltip content={<CustomTooltip />} />
    <Legend />
    <Bar dataKey="sales" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
    <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

## Stacked bar chart

```tsx
<Bar dataKey="completed" stackId="a" fill="hsl(var(--chart-1))" />
<Bar dataKey="pending" stackId="a" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
```

Add `stackId="a"` to bars that should stack. Put `radius` only on the top bar.

## Line chart

```tsx
import { LineChart, Line } from "recharts"

<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
    <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
    <YAxis className="text-xs fill-muted-foreground" />
    <Tooltip content={<CustomTooltip />} />
    <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
    <Line type="monotone" dataKey="target" stroke="hsl(var(--chart-2))" strokeWidth={2} strokeDasharray="5 5" />
  </LineChart>
</ResponsiveContainer>
```

## Area chart

```tsx
import { AreaChart, Area } from "recharts"

<ResponsiveContainer width="100%" height={300}>
  <AreaChart data={data}>
    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
    <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
    <YAxis className="text-xs fill-muted-foreground" />
    <Tooltip content={<CustomTooltip />} />
    <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.2} />
  </AreaChart>
</ResponsiveContainer>
```

## Pie / donut chart

```tsx
import { PieChart, Pie, Cell } from "recharts"

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"]

<ResponsiveContainer width="100%" height={300}>
  <PieChart>
    <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={60} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
      {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
    </Pie>
    <Tooltip content={<CustomTooltip />} />
    <Legend />
  </PieChart>
</ResponsiveContainer>
```

`innerRadius={60}` makes it a donut chart. Remove for solid pie.

## Custom tooltip (theme-aware)

```tsx
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card p-3 shadow-md">
      <p className="text-sm font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{entry.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}
```

Use `<Tooltip content={<CustomTooltip />} />` on any chart.

## Number formatting on axes

```tsx
<YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
<YAxis tickFormatter={(v) => v.toLocaleString()} />
<XAxis tickFormatter={(v) => format(parseISO(v), "MMM d")} />  // date axis with date-fns
```

## Dashboard stat card + sparkline

```tsx
function StatCard({ title, value, trend, data }: { title: string; value: string; trend: string; data: { v: number }[] }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{trend}</p>
        <ResponsiveContainer width="100%" height={40}>
          <AreaChart data={data}>
            <Area type="monotone" dataKey="v" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.1} strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
```

## Common mistakes

1. **Forgetting `ResponsiveContainer`** — chart renders at 0px height without it.
2. **Using hardcoded colors** — use `hsl(var(--chart-N))` for dark mode support.
3. **Not handling empty data** — check `data.length > 0` before rendering the chart, or show an empty state.
4. **Pie chart without `Cell`** — all slices render the same color without mapping `Cell` with `fill`.
