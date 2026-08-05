import type { Multipart } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import type { JsonValue, WebhookFile, WebhookRequest } from './external-service-definition';

export interface WebhookFastifyRequest extends FastifyRequest<{ Body: JsonValue }> {
  isMultipart(): boolean;
  parts(): AsyncIterableIterator<Multipart>;
}

export async function parseWebhookRequest(req: WebhookFastifyRequest): Promise<WebhookRequest> {
  const headers = headersOf(req);
  if (req.isMultipart()) return { ...(await parseMultipart(req)), headers };

  const json = req.body ?? null;
  return { headers, fields: stringFieldsOf(json), files: [], json };
}

async function parseMultipart(req: WebhookFastifyRequest): Promise<Omit<WebhookRequest, 'headers'>> {
  const fields: Record<string, string> = {};
  const files: WebhookFile[] = [];

  for await (const part of req.parts()) {
    if (part.type === 'file') {
      files.push({
        fieldName: part.fieldname,
        filename: part.filename,
        contentType: part.mimetype,
        bytes: await part.toBuffer(),
      });
      continue;
    }
    fields[part.fieldname] = String(part.value);
  }

  return { fields, files, json: null };
}

function headersOf(req: WebhookFastifyRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[name.toLowerCase()] = value;
    else if (Array.isArray(value)) headers[name.toLowerCase()] = value.join(', ');
  }
  return headers;
}

function stringFieldsOf(json: JsonValue): Record<string, string> {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return {};

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(json)) {
    if (typeof value === 'string') fields[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') fields[key] = String(value);
  }
  return fields;
}
