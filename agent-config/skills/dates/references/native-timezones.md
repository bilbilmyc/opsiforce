# Native Timezones (@date-fns/tz)

The `@date-fns/tz` mandate (never `date-fns-tz`) lives in SKILL.md's Non-negotiable rules; migration guidance in references/anti-patterns.md. This file covers the `@date-fns/tz` API surface.

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
