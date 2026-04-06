---
name: date-fns
description: Format, parse, and manipulate dates with date-fns. Also includes react-day-picker for calendar/date picker UI. Use when working with dates, timestamps, relative time, date selection, or date range pickers.
---

# date-fns + react-day-picker

## Format dates

```tsx
import { format, formatDistanceToNow, parseISO, addDays, subDays, differenceInDays, isAfter, isBefore, startOfDay, endOfDay, startOfWeek, startOfMonth, isToday, isThisWeek } from "date-fns"

format(new Date(), "PPP")                // "April 1, 2026"
format(new Date(), "PP")                 // "Apr 1, 2026"
format(new Date(), "p")                  // "2:30 PM"
format(new Date(), "PPp")               // "Apr 1, 2026 at 2:30 PM"
format(new Date(), "yyyy-MM-dd")         // "2026-04-01"
format(new Date(), "MMM d")             // "Apr 1"
format(new Date(), "EEEE")             // "Wednesday"

formatDistanceToNow(parseISO("2026-03-28"), { addSuffix: true })  // "4 days ago"
```

## Parse API dates

SQLite returns dates as ISO strings. Always parse before formatting:

```tsx
const createdAt = parseISO(item.created_at)
format(createdAt, "PP")  // "Apr 1, 2026"
```

## Date comparisons and sorting

```tsx
// Sort items by date (newest first)
items.sort((a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime())

// Filter items from last 7 days
const recent = items.filter(item => isAfter(parseISO(item.created_at), subDays(new Date(), 7)))

// Check if overdue
const isOverdue = item.due_date && isBefore(parseISO(item.due_date), startOfDay(new Date()))

// Group by date
const today = items.filter(i => isToday(parseISO(i.created_at)))
const thisWeek = items.filter(i => isThisWeek(parseISO(i.created_at)))
```

## Date picker (single date)

```tsx
import { DayPicker } from "react-day-picker"
import "react-day-picker/style.css"
import { format } from "date-fns"

function DatePickerField({ value, onChange }: { value?: Date; onChange: (date?: Date) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-full justify-start text-left", !value && "text-muted-foreground")}>
          <Calendar className="h-4 w-4 mr-2" />
          {value ? format(value, "PP") : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <DayPicker mode="single" selected={value} onSelect={(d) => { onChange(d); setOpen(false) }} />
      </PopoverContent>
    </Popover>
  )
}
```

Note: `Popover` and `PopoverTrigger`/`PopoverContent` need to be created from `@radix-ui/react-popover` (see shadcn skill).

## Date range picker

```tsx
import { type DateRange } from "react-day-picker"

const [range, setRange] = useState<DateRange>()

<DayPicker mode="range" selected={range} onSelect={setRange} numberOfMonths={2} />

// Access range
if (range?.from && range?.to) {
  const days = differenceInDays(range.to, range.from)
}
```

## Date picker with constraints

```tsx
<DayPicker
  mode="single"
  selected={date}
  onSelect={setDate}
  disabled={[
    { before: new Date() },                           // disable past dates
    { after: addDays(new Date(), 30) },               // disable dates >30 days out
    { dayOfWeek: [0, 6] },                            // disable weekends
  ]}
  fromDate={new Date()}                                // calendar can't navigate before today
  toDate={addDays(new Date(), 90)}                     // calendar can't navigate past 90 days
/>
```

## Integration with react-hook-form

```tsx
const { control } = useForm<FormData>()

<Controller
  control={control}
  name="dueDate"
  render={({ field }) => (
    <DatePickerField value={field.value ? new Date(field.value) : undefined} onChange={(d) => field.onChange(d?.toISOString())} />
  )}
/>
```

Store dates as ISO strings in the form, matching SQLite format.

## Common mistakes

1. **Forgetting `parseISO()`** on API strings — `format("2026-04-01", "PP")` will throw. Always `format(parseISO(dateStr), "PP")`.
2. **Timezone confusion** — `parseISO` creates local time. SQLite `datetime('now')` stores UTC. For display, this is usually fine. For comparisons, use `startOfDay()` to normalize.
3. **react-day-picker CSS** — must import `react-day-picker/style.css` or the calendar will be unstyled.
