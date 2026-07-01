# Charts — advanced

Live/streaming data, many-chart dashboard performance, and the less-common chart variants. The four project rules from `SKILL.md` (ResponsiveContainer, theme tokens, custom tooltip, empty data) apply here too.

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
    <Area type="monotone" dataKey="band" fill="var(--chart-3)" stroke="var(--chart-3)" fillOpacity={0.2} />
    <Bar dataKey="actual" barSize={20} fill="var(--chart-1)" />
    <Line type="monotone" dataKey="forecast" stroke="var(--chart-2)" strokeWidth={2} />
  </ComposedChart>
</ResponsiveContainer>
```

## Radar chart

For comparing several quantitative variables on one shape (skills, ratings, feature coverage):

```tsx
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts"

<ResponsiveContainer width="100%" height={300}>
  <RadarChart data={data}>
    <PolarGrid className="stroke-border" />
    <PolarAngleAxis dataKey="subject" className="text-xs fill-muted-foreground" />
    <PolarRadiusAxis className="text-xs fill-muted-foreground" />
    <Tooltip content={<ChartTooltip />} />
    <Radar dataKey="score" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.4} />
  </RadarChart>
</ResponsiveContainer>
```

## Radial bar chart

For progress rings and part-of-whole gauges:

```tsx
import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts"

<ResponsiveContainer width="100%" height={300}>
  <RadialBarChart data={data} innerRadius="30%" outerRadius="100%" startAngle={90} endAngle={-270}>
    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
    <RadialBar dataKey="value" cornerRadius={4} background fill="var(--chart-1)" />
    <Tooltip content={<ChartTooltip />} />
  </RadialBarChart>
</ResponsiveContainer>
```

## Brush (zoom range selector)

For long time series — adds a draggable range selector below the chart:

```tsx
import { Brush } from "recharts"

<LineChart data={data}>
  {/* ... */}
  <Brush dataKey="date" height={30} stroke="var(--chart-1)" />
</LineChart>
```

## Synchronized charts

Link the cursor and tooltip across multiple charts with the same `syncId`:

```tsx
<LineChart data={revenue} syncId="dashboard">{/* ... */}</LineChart>
<LineChart data={users} syncId="dashboard">{/* ... */}</LineChart>
```

**Scope `syncId` to one dashboard.** Every chart sharing an id syncs, including ones elsewhere on the page — a reused id links charts that shouldn't move together.

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
  <Line type="monotone" dataKey="value" stroke="var(--chart-1)" isAnimationActive={false} />
</LineChart>
```

For server-driven data, prefer `useQuery` from the `data-fetching` skill over `useEffect` polling.
