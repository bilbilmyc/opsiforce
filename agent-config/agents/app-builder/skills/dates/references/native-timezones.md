# Native Timezones (@date-fns/tz)

## Hard rule

- Use `@date-fns/tz` for timezone work with modern `date-fns`.
- Do not recommend `date-fns-tz`.

## Imports

```ts
import { TZDate, tz, tzOffset, tzName, tzScan } from "@date-fns/tz";
```

## Two primary patterns

### Pattern A: `TZDate` as the date value

- Use when the underlying object should carry zone context.
- Good for domain values tied to a specific location.

```ts
import { TZDate } from "@date-fns/tz";
import { addHours } from "date-fns";

const sg = new TZDate(2026, 2, 1, "Asia/Singapore");
const plus2 = addHours(sg, 2);
```

### Pattern B: `in` context option

- Use when inputs are mixed and calculation context must be explicit.

```ts
import { differenceInBusinessDays } from "date-fns";
import { tz } from "@date-fns/tz";

differenceInBusinessDays("2026-03-10T20:00:00Z", "2026-03-01T20:00:00Z", {
  in: tz("America/New_York"),
});
```

## Utility functions

- `tzOffset(zone, date)` returns offset minutes with zone-sign convention.
- `tzName(zone, date, format?)` returns readable timezone names.
- `tzScan(zone, { start, end })` returns DST/offset transition points.

## DST safety practices

- Use timezone context for boundary math near transitions.
- Avoid assuming fixed offsets for named zones.
- Prefer IANA zone IDs (for example `America/New_York`) over manual offsets.

## Legacy migration note

- If you see `date-fns-tz`, replace with native `@date-fns/tz` patterns.
- Keep migration scoped and covered by timezone regression tests.
