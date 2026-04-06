---
name: input-otp
description: OTP / verification code input with input-otp (pre-installed). Use when the app needs a PIN entry, verification code, two-factor authentication code input, or any fixed-length numeric/alphanumeric code field.
---

# input-otp — OTP / Verification Code Input

`input-otp` is pre-installed. No need to `bun add`.

## Basic OTP input (6-digit)

```tsx
import { OTPInput, SlotProps } from "input-otp"
import { cn } from "@/lib/utils"

function OTPField({ value, onChange, length = 6 }: { value: string; onChange: (val: string) => void; length?: number }) {
  return (
    <OTPInput
      maxLength={length}
      value={value}
      onChange={onChange}
      containerClassName="flex items-center gap-2"
      render={({ slots }) => (
        <div className="flex gap-2">
          {slots.map((slot, i) => (
            <Slot key={i} {...slot} />
          ))}
        </div>
      )}
    />
  )
}

function Slot(props: SlotProps) {
  return (
    <div className={cn(
      "relative h-12 w-10 rounded-md border border-input bg-background text-center text-lg font-medium",
      "flex items-center justify-center",
      props.isActive && "ring-2 ring-ring border-ring",
    )}>
      {props.char ?? (props.isActive ? <div className="absolute inset-0 flex items-center justify-center"><div className="h-5 w-px bg-foreground animate-pulse" /></div> : null)}
    </div>
  )
}
```

## With separator (XXX-XXX pattern)

```tsx
<OTPInput
  maxLength={6}
  value={value}
  onChange={onChange}
  render={({ slots }) => (
    <div className="flex items-center gap-2">
      {slots.slice(0, 3).map((slot, i) => <Slot key={i} {...slot} />)}
      <span className="text-muted-foreground">-</span>
      {slots.slice(3).map((slot, i) => <Slot key={i + 3} {...slot} />)}
    </div>
  )}
/>
```

## Auto-submit on complete

```tsx
const [code, setCode] = useState("")

function handleChange(val: string) {
  setCode(val)
  if (val.length === 6) {
    verifyMutation.mutate(val)
  }
}

<OTPField value={code} onChange={handleChange} />
```

## Integration with react-hook-form

```tsx
<Controller
  control={control}
  name="verificationCode"
  render={({ field }) => (
    <OTPField value={field.value} onChange={field.onChange} />
  )}
/>
```

## Common mistakes

1. **Not setting `maxLength`** — input accepts unlimited characters without it.
2. **Forgetting auto-submit** — users expect the form to submit when all digits are entered.
3. **Missing focus ring** — use `isActive` prop to show which slot is focused.
