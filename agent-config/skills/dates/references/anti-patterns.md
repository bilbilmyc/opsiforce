# Anti-Patterns

## Never recommend `date-fns-tz` for modern date-fns

- Required package: `@date-fns/tz`.
- Treat `date-fns-tz` as legacy context only.
- If the codebase still uses it, recommend a migration path.

## Other pitfalls

- Using `YYYY`/`DD` when calendar year/day-of-month is intended.
- Running timezone-sensitive calculations without explicit timezone context.
- Mixing string math and date math.
- Skipping `isValid` checks after parsing user input.

## Quick project audit

```bash
rg -n "date-fns-tz|YYYY|\\bDD\\b" .
```
