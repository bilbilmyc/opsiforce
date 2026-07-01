# Core Functions

## Must-know parser + validation

- `parseISO` for ISO datetime strings.
- `toDate` for generic conversion.
- `isValid` to reject invalid dates before business logic.

## Must-know arithmetic

- `add` / `sub` for multi-unit math.
- `addDays`, `addWeeks`, `addMonths`, `addYears`.
- `differenceInDays`, `differenceInHours`, `differenceInMinutes`.
- `differenceInBusinessDays` when business-day logic matters.

## Must-know boundaries

- `startOfDay`, `endOfDay`
- `startOfWeek`, `endOfWeek`
- `startOfMonth`, `endOfMonth`
- `startOfYear`, `endOfYear`

## Must-know compare/filter

- `isBefore`, `isAfter`, `isEqual`
- `isSameDay`, `isSameMonth`, `isSameYear`
- `isWithinInterval`, `areIntervalsOverlapping`
- `min`, `max`, `clamp`

## Must-know output helpers

- `format` for UI output.
- `formatISO`, `formatRFC3339` for APIs.
- `formatDistance`, `formatDistanceStrict` for relative human text.

## Practical minimal set (default recommendation)

- `parseISO`, `isValid`
- `addDays`, `differenceInDays`
- `startOfDay`, `endOfDay`
- `isWithinInterval`
- `format`
