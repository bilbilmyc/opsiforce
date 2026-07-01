# Examples

## 1) Parse + validate + compute

```ts
import { parseISO, isValid, addDays } from "date-fns";

const base = parseISO("2026-04-01T12:00:00Z");
if (!isValid(base)) throw new Error("Invalid date");
const due = addDays(base, 7);
```

## 2) Interval check

```ts
import { isWithinInterval } from "date-fns";

const inWindow = isWithinInterval(new Date(), {
  start: new Date("2026-04-01T00:00:00Z"),
  end: new Date("2026-04-30T23:59:59Z"),
});
```

## 3) Timezone-aware same-day comparison

```ts
import { isSameDay } from "date-fns";
import { tz } from "@date-fns/tz";

const same = isSameDay("2026-04-01T23:30:00-04:00", "2026-04-02T11:30:00+08:00", {
  in: tz("Europe/Prague"),
});
```

## 4) TZDate around DST-sensitive math

```ts
import { TZDate } from "@date-fns/tz";
import { addHours } from "date-fns";

const local = new TZDate(2026, 2, 8, "America/New_York");
const twoHoursLater = addHours(local, 2);
```

## 5) Standardized API output + UI output

```ts
import { formatISO, format } from "date-fns";

const d = new Date();
const apiValue = formatISO(d);
const uiValue = format(d, "yyyy-MM-dd HH:mm");
```
