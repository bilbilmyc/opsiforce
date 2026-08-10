export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

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

export interface StoredAttachment {
  filename: string | null;
  contentType: string | null;
  sizeBytes: number;
  content: Buffer | null;
}

export interface StoredMessage {
  providerMessageId: string;
  rawPayload: string;
  routingKey: string;
  sender: string | null;
  textBody: string | null;
  payload: JsonValue;
  attachments: StoredAttachment[];
}

export interface PublishCarryContext {
  sourceEnvironmentId: string;
  targetEnvironmentId: string;
}

export type ServiceRouteMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface AgentRouteContext {
  environmentId: string;
  params: Record<string, string>;
  body: JsonValue;
}

export interface AdminRouteContext {
  params: Record<string, string>;
  body: JsonValue;
  query: Record<string, string>;
}

export interface ServiceRoute<Ctx> {
  readonly method: ServiceRouteMethod;
  readonly path: string;
  handler(context: Ctx): Promise<JsonValue>;
}

export interface ServiceRouteTables {
  readonly agent?: ReadonlyArray<ServiceRoute<AgentRouteContext>>;
  readonly admin?: ReadonlyArray<ServiceRoute<AdminRouteContext>>;
}

export interface ExternalServiceDefinition {
  readonly serviceName: string;
  readonly displayName: string;
  readonly unroutableResponse: 'reject' | 'accept';
  readonly routes?: ServiceRouteTables;
  verify(request: WebhookRequest): WebhookVerification | Promise<WebhookVerification>;
  extractRoutingKeys(request: WebhookRequest): string[];
  resolveEnvironments(routingKey: string, request: WebhookRequest): Promise<string[]>;
  buildRows(request: WebhookRequest, routingKey: string): StoredMessage[] | Promise<StoredMessage[]>;
  identity(projectEnvironmentId: string): Promise<JsonValue>;
  provisionEnvironment?(projectEnvironmentId: string): Promise<void>;
  carryOnPublish?(context: PublishCarryContext): Promise<void>;
  configReferencesResource?(config: JsonValue, resourceKey: string): boolean;
}

export const EXTERNAL_SERVICE_DEFINITIONS = Symbol('EXTERNAL_SERVICE_DEFINITIONS');
