---
name: multi-step-wizard
description: Build multi-step forms, wizards, and onboarding flows with step validation and progress indicators. Use when the app needs a signup flow, checkout process, onboarding wizard, or any form split across multiple steps with back/next navigation.
---

# Multi-Step Wizard

Uses existing libraries: react-hook-form + zod (per-step validation), motion (step transitions).

## Step container with progress

```tsx
import { useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Check } from "lucide-react"

interface WizardProps {
  steps: { title: string; component: React.ComponentType<{ onNext: (data: Record<string, unknown>) => void; onBack: () => void; data: Record<string, unknown> }> }[]
  onComplete: (data: Record<string, unknown>) => void
}

function Wizard({ steps, onComplete }: WizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [direction, setDirection] = useState(1)

  function handleNext(stepData: Record<string, unknown>) {
    const merged = { ...formData, ...stepData }
    setFormData(merged)
    if (currentStep === steps.length - 1) {
      onComplete(merged)
    } else {
      setDirection(1)
      setCurrentStep(prev => prev + 1)
    }
  }

  function handleBack() {
    setDirection(-1)
    setCurrentStep(prev => Math.max(0, prev - 1))
  }

  const StepComponent = steps[currentStep].component

  return (
    <div className="mx-auto max-w-lg">
      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors",
              i < currentStep ? "bg-primary border-primary text-primary-foreground" :
              i === currentStep ? "border-primary text-primary" :
              "border-muted text-muted-foreground"
            )}>
              {i < currentStep ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn("text-sm hidden sm:block", i === currentStep ? "font-medium" : "text-muted-foreground")}>
              {step.title}
            </span>
            {i < steps.length - 1 && <div className={cn("h-0.5 flex-1", i < currentStep ? "bg-primary" : "bg-muted")} />}
          </div>
        ))}
      </div>

      {/* Step content with animation */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStep}
          custom={direction}
          initial={{ opacity: 0, x: direction * 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -50 }}
          transition={{ duration: 0.2 }}
        >
          <StepComponent onNext={handleNext} onBack={handleBack} data={formData} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
```

## Individual step components (with per-step validation)

```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

// Step 1: Basic Info
const step1Schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
})

function BasicInfoStep({ onNext, data }: { onNext: (data: Record<string, unknown>) => void; onBack: () => void; data: Record<string, unknown> }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(step1Schema),
    defaultValues: { name: (data.name as string) ?? "", email: (data.email as string) ?? "" },
  })

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-1 block">Name</label>
        <Input {...register("name")} />
        {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Email</label>
        <Input {...register("email")} type="email" />
        {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
      </div>
      <div className="flex justify-end">
        <Button type="submit">Next</Button>
      </div>
    </form>
  )
}

// Step 2: Preferences
const step2Schema = z.object({
  role: z.string().min(1, "Select a role"),
  notifications: z.boolean().default(true),
})

function PreferencesStep({ onNext, onBack, data }: { onNext: (data: Record<string, unknown>) => void; onBack: () => void; data: Record<string, unknown> }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(step2Schema),
    defaultValues: { role: (data.role as string) ?? "", notifications: (data.notifications as boolean) ?? true },
  })

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-1 block">Role</label>
        <select {...register("role")} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">Select...</option>
          <option value="developer">Developer</option>
          <option value="designer">Designer</option>
          <option value="manager">Manager</option>
        </select>
        {errors.role && <p className="text-sm text-destructive mt-1">{errors.role.message}</p>}
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" {...register("notifications")} className="rounded border-input" />
        <span className="text-sm">Enable notifications</span>
      </label>
      <div className="flex justify-between">
        <Button variant="outline" type="button" onClick={onBack}>Back</Button>
        <Button type="submit">Next</Button>
      </div>
    </form>
  )
}

// Step 3: Review & Submit
function ReviewStep({ onNext, onBack, data }: { onNext: (data: Record<string, unknown>) => void; onBack: () => void; data: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{data.name as string}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{data.email as string}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium">{data.role as string}</span>
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={() => onNext({})}>Complete</Button>
      </div>
    </div>
  )
}
```

## Wiring it together

```tsx
const steps = [
  { title: "Basic Info", component: BasicInfoStep },
  { title: "Preferences", component: PreferencesStep },
  { title: "Review", component: ReviewStep },
]

function OnboardingPage() {
  const createUser = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { toast.success("Account created!"); navigate("/dashboard") },
    onError: () => toast.error("Something went wrong"),
  })

  return <Wizard steps={steps} onComplete={(data) => createUser.mutate(data)} />
}
```

## Simple progress bar alternative

```tsx
<div className="mb-6">
  <div className="flex justify-between text-sm text-muted-foreground mb-2">
    <span>Step {currentStep + 1} of {steps.length}</span>
    <span>{steps[currentStep].title}</span>
  </div>
  <div className="h-2 rounded-full bg-muted">
    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }} />
  </div>
</div>
```

## Common mistakes

1. **Losing data when going back** — always pass `defaultValues` from the accumulated `formData` so previous answers are restored.
2. **Validating all steps at once** — validate only the current step's fields. Don't block step 1 because step 3 is empty.
3. **No back button** — users need to correct previous answers. Always provide a way back (except on step 1).
4. **Submitting on every "Next"** — only call the API on the final step. Intermediate steps just accumulate data locally.
