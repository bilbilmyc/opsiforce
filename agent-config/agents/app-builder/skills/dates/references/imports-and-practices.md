# Imports and Practices

## Recommended imports

```ts
import { format, parseISO, isValid, addDays, isWithinInterval } from "date-fns";
import { TZDate, tz } from "@date-fns/tz";
```

## Do

- Keep imports explicit and minimal.
- Parse input near boundaries, then pass `Date`/`TZDate` through logic.
- Keep API transport format separate from UI display format.
- Keep all timezone assumptions explicit in code.

## Do not

- Do not mutate `Date` in shared utility code if pure helpers are available.
- Do not compare date strings lexicographically for business logic.
- Do not use `date-fns-tz`.

## Input strategy

- API timestamps: `parseISO`.
- User-entered local date: parse with explicit format and validate.
- Unknown values: normalize with `toDate` + `isValid` guard.

## Output strategy

- API/output standardization: `formatISO` or `formatRFC3339`.
- User UI: `format` with locale-aware token patterns.
- Relative text: `formatDistance` / `formatDistanceStrict`.
