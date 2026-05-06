---
name: charts
description: Charts and data visualization with Recharts — bar, stacked bar, horizontal bar, line, area, stacked area, pie, donut, scatter, composed (mixed line/bar/area), radar, radial bar. Plus reference lines/areas (targets, thresholds), brush (zoom), synced charts, click drill-down, custom theme-aware tooltips, sparklines in stat cards, axis formatters (currency/percentages/dates), responsive sizing, accessibility. Use whenever the user wants graphs, charts, dashboards, analytics, KPIs, trends, or any visual representation of numeric or temporal data. Always wrap in ResponsiveContainer and use theme tokens (`hsl(var(--chart-1..5))`) — never hardcoded colors.
---

# Charts (Recharts)

Recharts is preinstalled. Composable React + D3 charts. Charts are built by nesting components inside one of `LineChart`, `BarChart`, `AreaChart`, `PieChart`, `ScatterChart`, `RadarChart`, `RadialBarChart`, or `ComposedChart`.

## Project rules

- **Always wrap charts in `<ResponsiveContainer width="100%" height={N}>`** — without it the chart renders at 0px height. The parent must have a defined width; height must be a number, not a percentage.
- **Always use theme tokens** for colors: `hsl(var(--chart-1))` through `hsl(var(--chart-5))`. Never hardcode hex values — they break dark mode and look generic.
- **Always render a custom tooltip** so it matches the app's card/border styling (default tooltip is white-on-white in dark mode).
- **Always handle empty data** — render a skeleton or empty state when `data.length === 0`. An empty chart shows axes and confuses users.

## Data shape

Recharts expects an array of objects. Each object is one data point; each numeric property can be plotted as a series.

```ts
const data = [
  { month: "Jan", revenue: 4000, expenses: 2400 },
  { month: "Feb", revenue: 3000, expenses: 1398 },
  { month: "Mar", revenue: 2000, expenses: 9800 },
]
```

`dataKey` props map object properties to chart components: `dataKey="revenue"`, or `dataKey={(entry) => entry.revenue - entry.expenses}` for derived values (memoize the function — see Performance).

## Bar chart

```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

<ResponsiveContainer width="100%" height={300}>
  <BarChart data={data}>
    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
    <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
    <YAxis className="text-xs fill-muted-foreground" />
    <Tooltip content={<ChartTooltip />} />
    <Legend />
    <Bar dataKey="revenue" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
    <Bar dataKey="expenses" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

**Stacked bars** — share a `stackId`, only the top bar gets `radius`:

```tsx
<Bar dataKey="completed" stackId="a" fill="hsl(var(--chart-1))" />
<Bar dataKey="pending" stackId="a" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
```

**Horizontal bar** — flip layout and swap axis types:

```tsx
<BarChart layout="vertical" data={data}>
  <XAxis type="number" />
  <YAxis type="category" dataKey="name" />
  <Bar dataKey="value" fill="hsl(var(--chart-1))" />
</BarChart>
```

## Line chart

```tsx
import { LineChart, Line } from "recharts"

<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
    <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
    <YAxis className="text-xs fill-muted-foreground" />
    <Tooltip content={<ChartTooltip />} />
    <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
    <Line type="monotone" dataKey="target" stroke="hsl(var(--chart-2))" strokeWidth={2} strokeDasharray="5 5" />
  </LineChart>
</ResponsiveContainer>
```

`type` options: `"monotone"` (smooth, default for trend data), `"linear"`, `"step"`, `"natural"`. Set `dot={false}` for dense series, `connectNulls` to bridge gaps.

## Area chart

```tsx
import { AreaChart, Area } from "recharts"

<ResponsiveContainer width="100%" height={300}>
  <AreaChart data={data}>
    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
    <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
    <YAxis className="text-xs fill-muted-foreground" />
    <Tooltip content={<ChartTooltip />} />
    <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.2} />
  </AreaChart>
</ResponsiveContainer>
```

**Stacked areas** — share a `stackId`:

```tsx
<Area type="monotone" dataKey="ios" stackId="1" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.4} />
<Area type="monotone" dataKey="android" stackId="1" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.4} />
```

**Gradient fill** — define once in `<defs>`, reference by URL:

```tsx
<AreaChart data={data}>
  <defs>
    <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.6} />
      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
    </linearGradient>
  </defs>
  <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" fill="url(#fillValue)" />
</AreaChart>
```

## Pie / donut chart

```tsx
import { PieChart, Pie, Cell } from "recharts"

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]

<ResponsiveContainer width="100%" height={300}>
  <PieChart>
    <Pie
      data={data}
      dataKey="value"
      nameKey="name"
      cx="50%"
      cy="50%"
      innerRadius={60}
      outerRadius={100}
      paddingAngle={2}
      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
    >
      {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
    </Pie>
    <Tooltip content={<ChartTooltip />} />
    <Legend />
  </PieChart>
</ResponsiveContainer>
```

`innerRadius={0}` for a solid pie, `> 0` for a donut. `Cell` will be replaced by the `shape` prop in Recharts 4 — `Cell` still works today, plan to migrate when 4 ships.

## Scatter chart

```tsx
import { ScatterChart, Scatter } from "recharts"

<ResponsiveContainer width="100%" height={300}>
  <ScatterChart>
    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
    <XAxis type="number" dataKey="x" name="Weight" className="text-xs fill-muted-foreground" />
    <YAxis type="number" dataKey="y" name="Height" className="text-xs fill-muted-foreground" />
    <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltip />} />
    <Scatter name="Sample A" data={data} fill="hsl(var(--chart-1))" />
  </ScatterChart>
</ResponsiveContainer>
```

For bubble charts, add `<ZAxis dataKey="size" range={[60, 400]} />` and the scatter dots scale with the third dimension.

## Composed chart (mixed types)

When one viewpoint needs a bar (totals) plus a line (trend) plus an area (band):

```tsx
import { ComposedChart, Bar, Line, Area } from "recharts"

<ResponsiveContainer width="100%" height={300}>
  <ComposedChart data={data}>
    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
    <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
    <YAxis className="text-xs fill-muted-foreground" />
    <Tooltip content={<ChartTooltip />} />
    <Legend />
    <Area type="monotone" dataKey="band" fill="hsl(var(--chart-3))" stroke="hsl(var(--chart-3))" fillOpacity={0.2} />
    <Bar dataKey="actual" barSize={20} fill="hsl(var(--chart-1))" />
    <Line type="monotone" dataKey="forecast" stroke="hsl(var(--chart-2))" strokeWidth={2} />
  </ComposedChart>
</ResponsiveContainer>
```

## Reference lines and areas

For targets, thresholds, and goal markers:

```tsx
import { ReferenceLine, ReferenceArea } from "recharts"

<LineChart data={data}>
  {/* ... axes, lines */}
  <ReferenceLine y={5000} label="Target" stroke="hsl(var(--chart-3))" strokeDasharray="3 3" />
  <ReferenceArea x1="Jan" x2="Mar" fill="hsl(var(--chart-2))" fillOpacity={0.1} label="Q1" />
</LineChart>
```

## Brush (zoom range selector)

For long time series — adds a draggable range selector below the chart:

```tsx
import { Brush } from "recharts"

<LineChart data={data}>
  {/* ... */}
  <Brush dataKey="date" height={30} stroke="hsl(var(--chart-1))" />
</LineChart>
```

## Synchronized charts

Link the cursor and tooltip across multiple charts with the same `syncId`:

```tsx
<LineChart data={revenue} syncId="dashboard">{/* ... */}</LineChart>
<LineChart data={users} syncId="dashboard">{/* ... */}</LineChart>
```

## Click and hover events

```tsx
<BarChart onClick={(state) => console.log("chart click", state)}>
  <Bar
    dataKey="sales"
    fill="hsl(var(--chart-1))"
    onClick={(payload, index) => navigate(`/items/${payload.id}`)}
  />
</BarChart>
```

`Tooltip` has interaction props for click-to-pin or controlled selection:

```tsx
<Tooltip trigger="click" defaultIndex={0} cursor={false} content={<ChartTooltip />} />
```

## Theme-aware custom tooltip

```tsx
import type { TooltipProps } from "recharts"

interface TooltipPayloadEntry {
  name: string
  value: number
  color: string
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card p-3 shadow-md">
      <p className="text-sm font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{entry.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}
```

Use on every chart: `<Tooltip content={<ChartTooltip />} />`.

## Axis formatting

```tsx
// Currency
<YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />

// Locale-aware numbers
<YAxis tickFormatter={(v) => v.toLocaleString()} />

// Percentages
<YAxis tickFormatter={(v) => `${v}%`} domain={[0, 100]} />

// Dates with date-fns
import { format, parseISO } from "date-fns"
<XAxis dataKey="date" tickFormatter={(v) => format(parseISO(v), "MMM d")} />

// Rotate when labels overlap
<XAxis dataKey="month" angle={-45} textAnchor="end" height={60} />

// Force every label or auto-thin
<XAxis interval={0} />               // show every label (clip overlapping)
<XAxis interval="preserveStartEnd" /> // auto-decide, keep first + last
```

## Custom domains

```tsx
<YAxis domain={[0, 100]} />                              // fixed range
<YAxis domain={[0, "auto"]} />                           // auto upper
<YAxis domain={[0, "dataMax + 100"]} allowDataOverflow /> // padded
<YAxis type="number" scale="log" domain={["auto", "auto"]} /> // log scale
```

## Sparkline + stat card

Project pattern for KPI tiles:

```tsx
function StatCard({ title, value, trend, data }: {
  title: string
  value: string
  trend: string
  data: { v: number }[]
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{trend}</p>
        <ResponsiveContainer width="100%" height={40}>
          <AreaChart data={data}>
            <Area
              type="monotone"
              dataKey="v"
              stroke="hsl(var(--chart-1))"
              fill="hsl(var(--chart-1))"
              fillOpacity={0.1}
              strokeWidth={1.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
```

No axes, no tooltip, no grid — just the trend.

## Accessibility

`accessibilityLayer` is on by default (keyboard navigable, screen-reader compatible). Always add an aria-label that describes what the chart shows:

```tsx
<LineChart data={data} role="img" aria-label="Monthly revenue, January through June 2026">
  {/* ... */}
</LineChart>
```

## Performance

For dashboards with several charts or live data:

1. **Stable references** — wrap inline functions in `useCallback`:

```tsx
const accessor = useCallback((e: Row) => e.sales * 2, [])
<Line dataKey={accessor} />
```

2. **Memoize the chart** when its parent re-renders frequently:

```tsx
const RevenueChart = React.memo(({ data }: { data: Row[] }) => (
  <LineChart data={data}>{/* ... */}</LineChart>
))
```

3. **Aggregate large datasets** — bin or downsample before rendering. Recharts paints every point; >1000 points per series is usually wasted.

```tsx
const binned = useMemo(() => downsample(rawData, 200), [rawData])
```

4. **Disable animation for streaming data** — `isAnimationActive={false}` on the series prevents re-animating on every update.

5. **Debounce mouse handlers** — `onMouseMove` fires at every pixel:

```tsx
const handleMove = useDebouncedCallback((e) => setCursor(e.activeLabel), 16)
<LineChart onMouseMove={handleMove}>{/* ... */}</LineChart>
```

## Real-time data

```tsx
const [data, setData] = useState<Row[]>([])

useEffect(() => {
  const id = setInterval(() => {
    setData((prev) => [...prev.slice(-49), nextPoint()])  // keep last 50
  }, 1000)
  return () => clearInterval(id)
}, [])

<LineChart data={data}>
  <XAxis dataKey="time" />
  <YAxis domain={["auto", "auto"]} />
  <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" isAnimationActive={false} />
</LineChart>
```

For server-driven data, prefer `useQuery` from the `data-fetching` skill over `useEffect` polling.

## Empty / loading states

```tsx
if (isPending) return <Skeleton className="h-[300px] w-full" />
if (!data.length) {
  return (
    <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
      No data for this range
    </div>
  )
}
return <ResponsiveContainer height={300}>{/* chart */}</ResponsiveContainer>
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Chart renders blank / collapsed | Parent has no height, or `ResponsiveContainer` height is a percent. Set `height={300}` (number). |
| Tooltip shows white-on-white | You forgot `<Tooltip content={<ChartTooltip />} />` — default tooltip ignores theme. |
| All pie slices same color | Missing `<Cell key={i} fill={...} />` for each datum. |
| Axis labels overlap | `<XAxis angle={-45} textAnchor="end" height={80} />` or `interval="preserveStartEnd"`. |
| `dataKey` shows nothing | Property name typo or property is missing on some rows — Recharts silently treats `undefined` as a gap. |
| Animation stutters with live data | `isAnimationActive={false}` on the series. |
| Chart taking forever to render | Too many points — aggregate / downsample. >1000 per series is the warning sign. |

## Common mistakes

1. **Forgetting `ResponsiveContainer`** — chart renders at 0px height. Always wrap.
2. **Hardcoded hex colors** (`#8884d8`) — break dark mode, look generic. Use `hsl(var(--chart-N))`.
3. **No empty state** — empty axes with no data are confusing. Render a placeholder when `data.length === 0`.
4. **Missing custom tooltip** — default tooltip is unstyled and clashes with the app theme.
5. **`Cell` count mismatch** — if you map `Cell` over data you must use the same array; mismatched length leaves slices uncolored.
6. **`syncId` shared with unrelated charts** — every chart with that id syncs, including ones in other parts of the page. Scope ids to a dashboard.
7. **Re-creating the data array on every render** — causes the chart to re-animate. Memoize with `useMemo` if the source data is stable.

## Resources

- Official docs: https://recharts.org/
- API reference: https://recharts.org/en-US/api
- Storybook examples: https://recharts.org/en-US/examples
