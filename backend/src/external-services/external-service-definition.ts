export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type SqliteValue = string | number | Buffer | null;

export interface WebhookFile {
  fieldName: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export interface WebhookRequest {
  headers: Record<string, string>;
  fields: Record<string, string>;
  files: WebhookFile[];
  json: JsonValue;
}

export type WebhookVerification = { verified: true } | { verified: false; reason: string };

export interface ExternalServiceRow {
  providerMessageId: string;
  rawPayload: string;
  columns: Record<string, SqliteValue>;
  attachments: Array<Record<string, SqliteValue>>;
}

export interface PublishCarryContext {
  sourceEnvironmentId: string;
  targetEnvironmentId: string;
  declaredServices: string[];
}

export interface ExternalServiceDefinition {
  readonly serviceName: string;
  readonly messageTable: string;
  readonly attachmentTable: string | null;
  readonly attachmentParentColumn: string | null;
  readonly callbackPath: string;
  readonly migrations: readonly string[];
  readonly unroutableResponse: 'reject' | 'accept';
  verify(request: WebhookRequest): WebhookVerification | Promise<WebhookVerification>;
  extractRoutingKeys(request: WebhookRequest): string[];
  resolveEnvironments(routingKey: string, request: WebhookRequest): Promise<string[]>;
  buildRows(request: WebhookRequest, routingKey: string): ExternalServiceRow[] | Promise<ExternalServiceRow[]>;
  carryOnPublish?(context: PublishCarryContext): Promise<void>;
}

export const EXTERNAL_SERVICE_DEFINITIONS = Symbol('EXTERNAL_SERVICE_DEFINITIONS');
