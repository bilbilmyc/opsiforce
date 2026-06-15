import { Dialog as Kobalte } from '@kobalte/core/dialog';
import type { ComponentProps } from 'solid-js';

export function Dialog(props: ComponentProps<typeof Kobalte>) {
  return <Kobalte {...props} />;
}

export { Kobalte as KobalteDialog };
