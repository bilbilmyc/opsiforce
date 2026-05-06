# Forms & Inputs

Covers form structure, validation, control choice, and the `react-hook-form` + `zod` patterns used in this project. `react-hook-form`, `@hookform/resolvers`, and `zod` are pre-installed.

## Field structure: `Label` + control + optional description

Every input needs a `<Label htmlFor>` paired with the control's `id`. Stack with `flex flex-col gap-2`. Stack the form itself with `flex flex-col gap-4` (or larger for sectioned forms).

```tsx
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

<form className="flex flex-col gap-4">
  <div className="flex flex-col gap-2">
    <Label htmlFor="email">Email</Label>
    <Input id="email" type="email" />
    <p className="text-muted-foreground text-xs">We'll never share your email.</p>
  </div>
  {/* more fields */}
</form>
```

Never use `space-y-*` to stack fields — `gap-*` is the rule (see `styling.md`).

## Validation states: `aria-invalid` + matching error text

Shipped components (`Input`, `Textarea`, `Select`, `Checkbox`, `Switch`) honor `aria-invalid` — they switch to destructive ring/border when set. Pair with a destructive-toned error message below.

```tsx
<div className="flex flex-col gap-2">
  <Label htmlFor="email">Email</Label>
  <Input id="email" aria-invalid={!!errors.email} {...register("email")} />
  {errors.email && (
    <p className="text-destructive text-sm">{errors.email.message}</p>
  )}
</div>
```

For `react-hook-form`, derive `aria-invalid` from `formState.errors` — don't manage a separate state.

## Disabled state

```tsx
<div className="flex flex-col gap-2">
  <Label htmlFor="email">Email</Label>
  <Input id="email" disabled />
</div>
```

The shipped `Label` already handles `peer-disabled` styling.

## Choosing a control

| Need                              | Use                                              |
| --------------------------------- | ------------------------------------------------ |
| Single-line free text             | `Input`                                          |
| Multi-line text                   | `Textarea`                                       |
| Predefined options dropdown       | `Select`                                         |
| Searchable dropdown / many opts   | `Command` inside `Popover` (combobox pattern)    |
| Boolean toggle (settings)         | `Switch`                                         |
| Boolean toggle (form field)       | `Checkbox`                                       |
| Single choice from few options    | Build wrapper over Radix `RadioGroup`            |
| Toggle 2–5 options                | Build wrapper over Radix `ToggleGroup`           |
| OTP / verification code           | Numeric `<Input>` — no `InputOTP` wrapper shipped |
| Date / date range                 | `react-day-picker` (pre-installed) inside `Popover` |

Don't use a native `<select>` — use the `Select` component for styling consistency.

## HTML semantics on inputs

These attributes change keyboard, autofill, and validation behavior — set them deliberately, not by accident.

- **Always set `type`** — `email`, `tel`, `url`, `number`, `search`, `password`, `date`. Triggers correct mobile keyboards and browser validation.
- **Set `inputmode`** when `type` doesn't fully describe the keyboard you want. E.g. `type="text" inputmode="numeric"` for an OTP field, `inputmode="decimal"` for a price input.
- **Set `autocomplete`** to a meaningful value (`email`, `current-password`, `new-password`, `name`, `tel`, `street-address`, `cc-number`). Use `autocomplete="off"` on non-auth fields where password managers shouldn't trigger.
- **Use a meaningful `name`** — browser autofill uses `name`, not `id`.
- **Disable spellcheck on emails, codes, usernames, identifiers**: `spellCheck={false}`.
- **Never block paste** (`onPaste` + `preventDefault`) — it's hostile to password managers and accessibility.
- **`autoFocus` sparingly** — acceptable on a single primary input on a desktop form. Avoid on mobile (pops the keyboard immediately).

```tsx
<Input type="email" name="email" autoComplete="email" />
<Input type="tel" name="phone" autoComplete="tel" inputMode="tel" />
<Input type="text" name="otp" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} />
<Input type="password" name="password" autoComplete="current-password" />
```

## Placeholders

- Show an example pattern, not a label. The label is in the `<Label>`, not the placeholder.
- End with an ellipsis: `"e.g. jane@acme.com…"`, `"Search projects…"`.

## Submit & error focus

- Submit button stays **enabled until the request starts** (don't disable on `formState.isValid` — it hides what's wrong). Disable + show spinner only during the in-flight mutation.
- On submission error, **focus the first invalid field** so keyboard users can correct it without re-tabbing.

```tsx
const onSubmit = async (data: FormData) => {
  try {
    await mutation.mutateAsync(data)
  } catch {
    setFocus(Object.keys(form.formState.errors)[0] as keyof FormData)
  }
}
```

`react-hook-form` exposes `setFocus(name)` from `useForm()`.

## Click target sizing

Checkbox / radio: the **label and control share a single hit target** — clicking the label toggles the control. Achieved via `htmlFor` matching the input `id`, or by wrapping the control inside the label. No dead zones between them.

## Unsaved-changes guard

For long forms, warn before navigation if the form is dirty:

```tsx
useEffect(() => {
  if (!form.formState.isDirty) return
  const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
  window.addEventListener("beforeunload", handler)
  return () => window.removeEventListener("beforeunload", handler)
}, [form.formState.isDirty])
```

For in-app navigation, hook into the router's `useBlocker` (react-router) or equivalent.

---

# react-hook-form + zod

## Basic form

```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  age: z.coerce.number().min(0).optional(),
})

type FormData = z.infer<typeof schema>

export function ContactForm({ onSubmit }: { onSubmit: (data: FormData) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  return (
    <form onSubmit={handleSubmit((data) => { onSubmit(data); reset() })} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
        {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" aria-invalid={!!errors.email} {...register("email")} />
        {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save"}
      </Button>
    </form>
  )
}
```

## Controlled fields (Select, Switch, Checkbox, Date Picker)

Components that don't accept `register()` (anything with `onValueChange` / `onCheckedChange` instead of `onChange`) need `Controller`.

```tsx
import { Controller } from "react-hook-form"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

<Controller
  control={control}
  name="priority"
  render={({ field }) => (
    <Select value={field.value} onValueChange={field.onChange}>
      <SelectTrigger id="priority"><SelectValue placeholder="Pick priority" /></SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="high">High</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )}
/>
```

Same pattern for `<Switch>`, `<Checkbox>`, and `react-day-picker` — wrap with `Controller`.

## Form with mutation + toast (full flow)

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

const queryClient = useQueryClient()

const createTask = useMutation({
  mutationFn: (data: FormData) =>
    fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => { if (!r.ok) throw new Error("Failed"); return r.json() }),
  onSuccess: () => {
    toast.success("Task created")
    queryClient.invalidateQueries({ queryKey: ["tasks"] })
    reset()
  },
  onError: () => toast.error("Failed to create task"),
})

<form onSubmit={handleSubmit((data) => createTask.mutate(data))} className="flex flex-col gap-4">
  {/* fields */}
  <Button type="submit" disabled={createTask.isPending}>
    {createTask.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
    {createTask.isPending ? "Creating..." : "Create Task"}
  </Button>
</form>
```

## Edit form (pre-fill with existing data)

```tsx
const form = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: {
    title: existingItem.title,
    description: existingItem.description ?? "",
    priority: existingItem.priority,
  },
})
```

For async-loaded data, call `reset()` after the fetch resolves:

```tsx
useEffect(() => {
  if (data) reset({ title: data.title, description: data.description ?? "" })
}, [data, reset])
```

## Dynamic field arrays (`useFieldArray`)

```tsx
import { useFieldArray } from "react-hook-form"
import { Plus, X } from "lucide-react"

const schema = z.object({
  title: z.string().min(1),
  items: z.array(z.object({
    name: z.string().min(1, "Required"),
    quantity: z.coerce.number().min(1),
  })).min(1, "Add at least one item"),
})

const { control, register } = useForm({
  resolver: zodResolver(schema),
  defaultValues: { items: [{ name: "", quantity: 1 }] },
})
const { fields, append, remove } = useFieldArray({ control, name: "items" })

{fields.map((field, index) => (
  <div key={field.id} className="flex items-start gap-2">
    <Input {...register(`items.${index}.name`)} placeholder="Item name" />
    <Input {...register(`items.${index}.quantity`)} type="number" className="w-20" />
    <Button variant="ghost" size="icon" onClick={() => remove(index)}>
      <X />
    </Button>
  </div>
))}
<Button variant="outline" type="button" onClick={() => append({ name: "", quantity: 1 })}>
  <Plus data-icon="inline-start" /> Add item
</Button>
```

## Common zod patterns

```tsx
z.string().min(1).max(100)                            // required, bounded
z.string().email()                                    // email
z.string().url()                                      // URL
z.coerce.number().positive()                          // number from string input
z.coerce.number().int().min(0)                        // integer
z.enum(["active", "inactive"])                        // enum
z.boolean().default(false)                            // checkbox
z.array(z.string()).min(1)                            // non-empty array
z.string().optional()                                 // optional
z.string().nullable()                                 // nullable
z.string().regex(/^\d{3}-\d{4}$/, "Invalid format")   // regex
z.string().transform(v => v.trim())                   // transform
```

---

# Multi-step wizards (onboarding, checkout, signup)

Pattern: one accumulated `formData` object, one step index, each step is its own `useForm` with its own zod schema. Only the final step calls the API.

```tsx
import { useState } from "react"
import { motion, AnimatePresence } from "motion/react"

type WizardData = { name?: string; email?: string; role?: string }
type StepProps<T> = { onNext: (data: T) => void; onBack: () => void; data: Partial<WizardData> }

function BasicInfoStep({ onNext, data }: StepProps<{ name: string; email: string }>) {
  const schema = z.object({ name: z.string().min(1), email: z.string().email() })
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: data.name ?? "", email: data.email ?? "" },
  })
  return (
    <form onSubmit={handleSubmit(onNext)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
        {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" aria-invalid={!!errors.email} {...register("email")} />
        {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
      </div>
      <Button type="submit">Next</Button>
    </form>
  )
}
// ...one component per step, each with its own schema

function Wizard() {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<WizardData>({})
  const steps = [BasicInfoStep, PreferencesStep, ReviewStep]
  const Step = steps[step]

  function next(stepData: Partial<WizardData>) {
    const merged = { ...data, ...stepData }
    setData(merged)
    if (step === steps.length - 1) submitMutation.mutate(merged)
    else setStep(s => s + 1)
  }

  return (
    <div className="mx-auto max-w-lg">
      <Progress value={((step + 1) / steps.length) * 100} className="mb-6" />
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <Step onNext={next} onBack={() => setStep(s => Math.max(0, s - 1))} data={data} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
```

**Wizard rules**:
- Pass `defaultValues` from accumulated `data` on every step so going back restores prior answers.
- Validate only the current step's fields, not the whole wizard.
- Always render a Back button (except step 1). Final step submits to the API; intermediate steps just accumulate.

---

# Patterns to avoid

## Buttons inside inputs — use a flex row

We don't ship `InputGroup`. For a search field with an inline action:

```tsx
<div className="flex items-center gap-2">
  <Input placeholder="Search..." />
  <Button size="icon"><SearchIcon /></Button>
</div>
```

## Don't manually loop `Button` for option sets

For 2–7 mutually exclusive options, build a `ToggleGroup` wrapper rather than rendering buttons with `variant={selected === x ? "default" : "outline"}` — the wrapper tracks state, handles a11y, and is one line at the call site.

## Common mistakes

1. **`z.number()` on `<input type="number">`** — HTML inputs always give strings. Use `z.coerce.number()`.
2. **Forgetting `defaultValues`** — uncontrolled fields start as `undefined`; React then warns when you switch from uncontrolled to controlled. Always set `defaultValues` (per-field or at the form level).
3. **Not disabling submit during mutation** — always `disabled={mutation.isPending}` to prevent double-submit.
4. **Using `space-y-*` between fields** — `flex flex-col gap-4` is the rule.
5. **Forgetting `htmlFor` / `id` pairs** — labels must connect to inputs by id for accessibility and for `peer-*` selectors to work.
6. **Using `register()` on `Select`/`Switch`/`Checkbox`** — these emit `onValueChange` / `onCheckedChange`, not `onChange`. Wrap with `<Controller>`.
