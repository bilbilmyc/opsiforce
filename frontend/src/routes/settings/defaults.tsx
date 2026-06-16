import { createFileRoute } from '@tanstack/solid-router';
import { DefaultsPage } from '~/pages/defaults';

export const Route = createFileRoute('/settings/defaults')({
  component: DefaultsPage,
});
