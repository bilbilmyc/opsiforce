import { createFileRoute } from '@tanstack/solid-router';
import { ExternalServicesUsagePage } from '~/pages/external-services-usage';

export const Route = createFileRoute('/admin/external-services/usage')({
  component: ExternalServicesUsagePage,
});
