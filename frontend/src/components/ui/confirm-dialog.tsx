import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./dialog"
import { Button } from "./button"

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "destructive" | "default"
  onConfirm: () => void
}

export default function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-sm">
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>{props.description}</DialogDescription>
        <div class="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={() => props.onOpenChange(false)}>
            {props.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={props.variant ?? "default"}
            size="sm"
            onClick={() => {
              props.onConfirm()
              props.onOpenChange(false)
            }}
          >
            {props.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
