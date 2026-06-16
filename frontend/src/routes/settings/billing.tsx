import { createFileRoute } from '@tanstack/solid-router';
import { BillingPage } from '~/pages/billing';

export const Route = createFileRoute('/settings/billing')({
  component: BillingPage,
});
