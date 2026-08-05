import { createFileRoute } from '@tanstack/solid-router';
import { WhatsAppChannelsPage } from '~/pages/whatsapp-channels';

export const Route = createFileRoute('/admin/whatsapp')({
  component: WhatsAppChannelsPage,
});
