import { toast } from 'solid-sonner';
import { useSetAppPin } from '~/api/projects';
import { config } from '~/config/config';
import ConfirmDialog from '~/components/ui/confirm-dialog';

export type PinDialogAction = 'pin' | 'unpin' | null;

export interface PinAppDialogsProps {
  projectId: string;
  environmentId?: string;
  action: PinDialogAction;
  onActionChange: (action: PinDialogAction) => void;
}

export default function PinAppDialogs(props: PinAppDialogsProps) {
  const setAppPin = useSetAppPin();

  const close = () => props.onActionChange(null);

  return (
    <>
      <ConfirmDialog
        open={props.action === 'pin'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={`Pin to ${config.catalogLabel}`}
        description={`This will make this app visible in your organization's catalog. Continue?`}
        confirmLabel="Pin"
        onConfirm={() =>
          setAppPin.mutate(
            { projectId: props.projectId, isPinned: true, environmentId: props.environmentId },
            {
              onSuccess: () => toast.success(`App pinned to ${config.catalogLabel}`),
              onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to pin'),
            }
          )
        }
      />
      <ConfirmDialog
        open={props.action === 'unpin'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={`Unpin from ${config.catalogLabel}`}
        description={`This will remove the app from your organization's catalog. Continue?`}
        confirmLabel="Unpin"
        variant="destructive"
        onConfirm={() =>
          setAppPin.mutate(
            { projectId: props.projectId, isPinned: false },
            {
              onSuccess: () => toast.success(`App unpinned from ${config.catalogLabel}`),
              onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to unpin'),
            }
          )
        }
      />
    </>
  );
}
