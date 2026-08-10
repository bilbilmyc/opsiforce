export const WHATSAPP_SERVICE_NAME = 'whatsapp';

export const WHATSAPP_WEBHOOK_SECRET_HEADER = 'X-Opsiforce-Webhook-Secret';

export const WHATSAPP_WEBHOOK_PATH = `/api/external-services/webhooks/${WHATSAPP_SERVICE_NAME}`;

export const WHATSAPP_GROUP_CHAT_SUFFIX = '@g.us';

export const WHATSAPP_INDIVIDUAL_CHAT_SUFFIX = '@s.whatsapp.net';

export const WHATSAPP_MEDIA_TYPES = new Set([
  'image',
  'video',
  'audio',
  'voice',
  'document',
  'sticker',
  'gif',
]);
