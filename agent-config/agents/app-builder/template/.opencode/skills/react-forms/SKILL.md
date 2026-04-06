---
name: react-forms
description: Build validated forms with react-hook-form and zod schemas. Use when creating any form, input validation, multi-step forms, or handling user input submission.
---

# React Hook Form + Zod

## Basic form

```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
    <form onSubmit={handleSubmit((data) => { onSubmit(data); reset() })} className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-1 block">Name</label>
        <Input {...register("name")} placeholder="Name" />
        {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Email</label>
        <Input {...register("email")} type="email" placeholder="Email" />
        {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save"}
      </Button>
    </form>
  )
}
```

## Multi-field form (select, checkbox, textarea)

```tsx
const schema = z.object({
  title: z.string().min(1, "Required"),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]),
  category: z.string().min(1, "Select a category"),
  isPublic: z.boolean().default(false),
  tags: z.string().optional(),
})

// In the form JSX:

// Textarea
<textarea {...register("description")} rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Description..." />

// Select (native — simplest approach)
<select {...register("priority")} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
  <option value="low">Low</option>
  <option value="medium">Medium</option>
  <option value="high">High</option>
</select>

// Checkbox
<label className="flex items-center gap-2">
  <input type="checkbox" {...register("isPublic")} className="rounded border-input" />
  <span className="text-sm">Make public</span>
</label>
```

For styled select, use Radix `@radix-ui/react-select` with `Controller` (see Controlled fields below).

## Controlled fields (Radix Select, Date Picker, etc.)

For components that don't support `register()`, use `Controller`:

```tsx
import { Controller, useForm } from "react-hook-form"

<Controller
  control={control}
  name="category"
  render={({ field }) => (
    <SelectPrimitive.Root value={field.value} onValueChange={field.onChange}>
      <SelectPrimitive.Trigger className="w-full rounded-md border border-input px-3 py-2 text-sm">
        <SelectPrimitive.Value placeholder="Select category" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content>
          <SelectPrimitive.Item value="work">Work</SelectPrimitive.Item>
          <SelectPrimitive.Item value="personal">Personal</SelectPrimitive.Item>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )}
/>
```

## Form with mutation + toast (full flow)

```tsx
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

<form onSubmit={handleSubmit((data) => createTask.mutate(data))}>
  {/* fields */}
  <Button type="submit" disabled={createTask.isPending}>
    {createTask.isPending ? "Creating..." : "Create Task"}
  </Button>
</form>
```

## Dynamic field arrays

```tsx
import { useFieldArray } from "react-hook-form"

const schema = z.object({
  title: z.string().min(1),
  items: z.array(z.object({
    name: z.string().min(1, "Required"),
    quantity: z.coerce.number().min(1),
  })).min(1, "Add at least one item"),
})

const { control, register } = useForm({ resolver: zodResolver(schema), defaultValues: { items: [{ name: "", quantity: 1 }] } })
const { fields, append, remove } = useFieldArray({ control, name: "items" })

{fields.map((field, index) => (
  <div key={field.id} className="flex gap-2 items-start">
    <Input {...register(`items.${index}.name`)} placeholder="Item name" />
    <Input {...register(`items.${index}.quantity`)} type="number" className="w-20" />
    <Button variant="ghost" size="icon" onClick={() => remove(index)}><X className="h-4 w-4" /></Button>
  </div>
))}
<Button variant="outline" type="button" onClick={() => append({ name: "", quantity: 1 })}>
  <Plus className="h-4 w-4 mr-1" /> Add Item
</Button>
```

## Common zod patterns

```tsx
z.string().min(1).max(100)           // required string with max
z.string().email()                    // email
z.string().url()                      // URL
z.coerce.number().positive()          // number from string input
z.coerce.number().int().min(0)        // integer
z.enum(["active", "inactive"])        // enum
z.boolean().default(false)            // checkbox
z.array(z.string()).min(1)            // non-empty array
z.string().optional()                 // optional
z.string().nullable()                 // nullable
z.string().regex(/^\d{3}-\d{4}$/, "Invalid format")  // regex
z.string().transform(v => v.trim())   // transform
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

Pass `defaultValues` to pre-fill. For async data, use `reset()` after fetching:

```tsx
useEffect(() => {
  if (data) reset({ title: data.title, description: data.description ?? "" })
}, [data, reset])
```

## Common mistakes

1. **`z.number()` on `<input type="number">`** — HTML inputs always give strings. Use `z.coerce.number()` to auto-convert.
2. **Forgetting `defaultValues`** — without defaults, uncontrolled fields start as `undefined` and React warns about switching from uncontrolled to controlled.
3. **Not disabling submit during mutation** — always disable the button when `isPending` to prevent double-submit.
