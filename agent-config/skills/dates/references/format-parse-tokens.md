# Format and Parse Tokens

## Key rule

- date-fns uses Unicode tokens.
- Do not assume Moment.js token behavior.

## Safe common tokens

- Year: `yyyy`
- Month: `MM`
- Day of month: `dd`
- Hour (24h): `HH`
- Minute: `mm`
- Second: `ss`

## Common mistakes

- `YYYY` is week-numbering year, not calendar year.
- `DD` is day of year, not day of month.

## Example

```ts
import { format, parse } from "date-fns";

format(new Date("2026-03-09T10:15:00Z"), "yyyy-MM-dd"); // correct
parse("09.03.26", "dd.MM.yy", new Date()); // correct
```

## Additional token options

Only use `useAdditionalWeekYearTokens` and `useAdditionalDayOfYearTokens` when intentionally using those token families.
