import { createFileRoute } from '@tanstack/solid-router';
import { ExternalServicesAdminPage } from '~/pages/external-services-admin';

export const Route = createFileRoute('/admin/external-services/')({
  component: ExternalServicesAdminPage,
});
