import { createFileRoute } from '@tanstack/solid-router';
import { StoragePage } from '~/pages/storage';

export const Route = createFileRoute('/admin/storage')({
  component: StoragePage,
});
