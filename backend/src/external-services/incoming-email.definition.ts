import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import type {
  ExternalServiceDefinition,
  ExternalServiceRow,
  JsonValue,
  PublishCarryContext,
  SqliteValue,
  WebhookRequest,
  WebhookVerification,
} from './external-service-definition';
import { IncomingEmailAddressService } from './incoming-email-address.service';
import { timingSafeStringEqual } from './timing-safe-equal';

export const INCOMING_EMAIL_SERVICE = 'incoming-email';

const ATTACHMENT_FIELD_PREFIX = 'attachment-';

const INCOMING_EMAIL_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS incoming_emails (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     received_at TEXT NOT NULL,
     raw_payload TEXT NOT NULL,
     app_delivered_at TEXT,
     provider_message_id TEXT NOT NULL,
     recipient TEXT NOT NULL,
     sender TEXT,
     from_header TEXT,
     subject TEXT,
     body_plain TEXT,
     body_html TEXT,
     stripped_text TEXT,
     message_headers TEXT
   );
   CREATE UNIQUE INDEX IF NOT EXISTS incoming_emails_provider_message_id
     ON incoming_emails (provider_message_id);
   CREATE TABLE IF NOT EXISTS email_attachments (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     incoming_email_id INTEGER NOT NULL REFERENCES incoming_emails (id) ON DELETE CASCADE,
     filename TEXT,
     content_type TEXT,
     size_bytes INTEGER NOT NULL,
     content BLOB NOT NULL
   );`,
] as const;

@Injectable()
export class IncomingEmailDefinition implements ExternalServiceDefinition {
  readonly serviceName = INCOMING_EMAIL_SERVICE;
  readonly messageTable = 'incoming_emails';
  readonly attachmentTable = 'email_attachments';
  readonly attachmentParentColumn = 'incoming_email_id';
  readonly callbackPath = `/api/external-services/${INCOMING_EMAIL_SERVICE}`;
  readonly migrations = INCOMING_EMAIL_MIGRATIONS;
  readonly unroutableResponse = 'reject' as const;

  private readonly logger = new Logger(IncomingEmailDefinition.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly incomingEmailAddressService: IncomingEmailAddressService
  ) {}

  verify(request: WebhookRequest): WebhookVerification {
    const signingKey = this.configService.get<string>('mailgunWebhookSigningKey', '').trim();
    if (!signingKey) {
      throw new ServiceUnavailableException('Incoming email is not configured on this platform');
    }

    const { timestamp, token, signature } = request.fields;
    if (!timestamp || !token || !signature) {
      return { verified: false, reason: 'Missing Mailgun signature fields' };
    }

    const expected = createHmac('sha256', signingKey)
      .update(timestamp + token)
      .digest('hex');
    if (!timingSafeStringEqual(expected, signature)) {
      return { verified: false, reason: 'Invalid Mailgun signature' };
    }

    return { verified: true };
  }

  extractRoutingKeys(request: WebhookRequest): string[] {
    const recipient = request.fields.recipient?.trim().toLowerCase();
    return recipient ? [recipient] : [];
  }

  async resolveEnvironments(routingKey: string): Promise<string[]> {
    const projectEnvironmentId = await this.incomingEmailAddressService.findEnvironmentIdByAddress(routingKey);
    if (!projectEnvironmentId) {
      this.logger.warn(`No environment is routed to incoming-email address ${routingKey}`);
      return [];
    }
    return [projectEnvironmentId];
  }

  async carryOnPublish(context: PublishCarryContext): Promise<void> {
    const sourceAddress = await this.incomingEmailAddressService.findAddress(context.sourceEnvironmentId);
    if (!sourceAddress && !context.declaredServices.includes(this.serviceName)) return;

    const address = await this.incomingEmailAddressService.getOrCreateAddress(context.targetEnvironmentId);
    this.logger.log(`Published environment ${context.targetEnvironmentId} receives mail at ${address}`);
  }

  buildRows(request: WebhookRequest, routingKey: string): ExternalServiceRow[] {
    const { fields } = request;

    return [
      {
        providerMessageId: providerMessageIdOf(fields),
        rawPayload: JSON.stringify(fields),
        columns: {
          provider_message_id: providerMessageIdOf(fields),
          recipient: routingKey,
          sender: fields.sender ?? null,
          from_header: fields.from ?? null,
          subject: fields.subject ?? null,
          body_plain: fields['body-plain'] ?? null,
          body_html: fields['body-html'] ?? null,
          stripped_text: fields['stripped-text'] ?? null,
          message_headers: fields['message-headers'] ?? null,
        },
        attachments: attachmentRowsOf(request),
      },
    ];
  }
}

function attachmentRowsOf(request: WebhookRequest): Array<Record<string, SqliteValue>> {
  return request.files
    .filter((file) => file.fieldName.startsWith(ATTACHMENT_FIELD_PREFIX))
    .map((file) => ({
      filename: file.filename || null,
      content_type: file.contentType || null,
      size_bytes: file.bytes.byteLength,
      content: file.bytes,
    }));
}

function providerMessageIdOf(fields: Record<string, string>): string {
  return fields['Message-Id'] ?? fields['message-id'] ?? messageIdFromHeaders(fields) ?? fields.token;
}

function messageIdFromHeaders(fields: Record<string, string>): string | null {
  const headers = fields['message-headers'];
  if (!headers) return null;

  try {
    const parsed = JSON.parse(headers) as JsonValue;
    if (!Array.isArray(parsed)) return null;
    for (const entry of parsed) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const [name, value] = entry;
      if (typeof name === 'string' && name.toLowerCase() === 'message-id' && typeof value === 'string') return value;
    }
  } catch {
    return null;
  }
  return null;
}
