# Calendar UI — react-day-picker

`react-day-picker` is preinstalled. Pair it with the `Popover` and `Button` components from the `ui` skill for a date-input field.

**Always import the stylesheet once at app entry** (e.g. `main.tsx`):

```ts
import "react-day-picker/style.css"
```

Without it the calendar renders unstyled and looks broken.

## Single date — Popover + Button

```tsx
import { useState } from "react"
import { DayPicker } from "react-day-picker"
import { format } from "date-fns"
import { Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

function DatePickerField({ value, onChange }: {
  value?: Date
  onChange: (date?: Date) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-full justify-start text-left", !value && "text-muted-foreground")}
        >
          <Calendar className="h-4 w-4 mr-2" />
          {value ? format(value, "PP") : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <DayPicker
          mode="single"
          selected={value}
          onSelect={(d) => { onChange(d); setOpen(false) }}
        />
      </PopoverContent>
    </Popover>
  )
}
```

## Date range

```tsx
import { DayPicker, type DateRange } from "react-day-picker"
import { differenceInDays } from "date-fns"

const [range, setRange] = useState<DateRange>()

<DayPicker
  mode="range"
  selected={range}
  onSelect={setRange}
  numberOfMonths={2}
/>

// Read the selection
if (range?.from && range?.to) {
  const days = differenceInDays(range.to, range.from)
}
```

## Constrained picker

```tsx
import { addDays } from "date-fns"

<DayPicker
  mode="single"
  selected={date}
  onSelect={setDate}
  disabled={[
    { before: new Date() },               // no past dates
    { after: addDays(new Date(), 30) },   // nothing more than 30 days out
    { dayOfWeek: [0, 6] },                // no weekends (Sun, Sat)
  ]}
  startMonth={new Date()}                  // hide nav before today
  endMonth={addDays(new Date(), 90)}       // hide nav past 90 days
/>
```

`disabled` accepts a single matcher or an array of matchers; combinations are AND-merged.

## react-hook-form integration

Store dates as ISO strings in form state — matches SQLite's wire format and survives JSON serialisation:

```tsx
import { Controller, useForm } from "react-hook-form"
import { parseISO, formatISO } from "date-fns"

const { control } = useForm<FormData>()

<Controller
  control={control}
  name="dueDate"
  render={({ field }) => (
    <DatePickerField
      value={field.value ? parseISO(field.value) : undefined}
      onChange={(d) => field.onChange(d ? formatISO(d) : undefined)}
    />
  )}
/>
```

Submitting `formatISO(date)` lines up with `node:sqlite`'s `datetime('now')` text format, so backend storage / retrieval stays roundtrip-safe.
