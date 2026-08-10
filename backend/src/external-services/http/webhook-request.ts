import type { Multipart } from '@fastify/multipart';
import { PayloadTooLargeException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { JsonValue, WebhookFile, WebhookRequest } from '../platform/external-service-definition';

const MEGABYTE = 1024 * 1024;
const PAYLOAD_TOO_LARGE = 413;
const OVERSIZED_PAYLOAD_MESSAGE = 'Webhook payload exceeds the accepted size';

interface MultipartLimits {
  fieldNameSize: number;
  fieldSize: number;
  fields: number;
  fileSize: number;
  files: number;
  parts: number;
}

const WEBHOOK_MULTIPART_LIMITS: MultipartLimits = {
  fieldNameSize: 256,
  fieldSize: 25 * MEGABYTE,
  fields: 64,
  fileSize: 25 * MEGABYTE,
  files: 20,
  parts: 100,
};

const WEBHOOK_BUFFERED_BYTES_LIMIT = 30 * MEGABYTE;

export interface WebhookFastifyRequest extends FastifyRequest<{ Body: JsonValue }> {
  isMultipart(): boolean;
  parts(options?: { limits: MultipartLimits }): AsyncIterableIterator<Multipart>;
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
  let bufferedBytes = 0;

  try {
    for await (const part of req.parts({ limits: WEBHOOK_MULTIPART_LIMITS })) {
      if (part.type === 'file') {
        const bytes = await part.toBuffer();

        bufferedBytes += bytes.byteLength;
        if (bufferedBytes > WEBHOOK_BUFFERED_BYTES_LIMIT) {
          throw new PayloadTooLargeException(OVERSIZED_PAYLOAD_MESSAGE);
        }

        files.push({
          fieldName: part.fieldname,
          filename: part.filename,
          contentType: part.mimetype,
          bytes,
        });
        continue;
      }

      if (part.valueTruncated) throw new PayloadTooLargeException(OVERSIZED_PAYLOAD_MESSAGE);

      const value = String(part.value);

      bufferedBytes += Buffer.byteLength(value);
      if (bufferedBytes > WEBHOOK_BUFFERED_BYTES_LIMIT) {
        throw new PayloadTooLargeException(OVERSIZED_PAYLOAD_MESSAGE);
      }

      fields[part.fieldname] = value;
    }
  } catch (error) {
    if (exceedsMultipartLimit(error)) throw new PayloadTooLargeException(OVERSIZED_PAYLOAD_MESSAGE);
    throw error;
  }

  return { fields, files, json: null };
}

function exceedsMultipartLimit(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as { statusCode?: unknown };
  return candidate.statusCode === PAYLOAD_TOO_LARGE;
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
