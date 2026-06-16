import { createFileRoute } from '@tanstack/solid-router';
import { PodsPage } from '~/pages/pods';

export const Route = createFileRoute('/admin/pods')({
  component: PodsPage,
});
