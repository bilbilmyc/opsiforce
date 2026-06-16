import { createFileRoute } from '@tanstack/solid-router';
import { EnvironmentsPage } from '~/pages/environments';

export const Route = createFileRoute('/settings/environments')({
  component: EnvironmentsPage,
});
