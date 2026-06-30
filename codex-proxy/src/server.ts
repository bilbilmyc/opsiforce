import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { CODEX_RESPONSES_URL, MODEL_CATALOG, ORIGINATOR, USER_AGENT, resolveMaxBodyBytes, resolvePort } from './config.ts';
import type { CodexAuth } from './auth-file.ts';
import { CodexAuthMissingError, getFreshAuth } from './token.ts';

interface ErrorBody {
  message: string;
  type: string;
}

type JsonRecord = Record<string, unknown>;

class PayloadTooLargeError extends Error {}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function sendError(res: ServerResponse, status: number, error: ErrorBody): void {
  sendJson(res, status, { error });
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new PayloadTooLargeError(`Request body exceeds the ${maxBytes}-byte limit.`);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      req.destroy();
      throw new PayloadTooLargeError(`Request body exceeds the ${maxBytes}-byte limit.`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function handleModels(res: ServerResponse): void {
  const created = Math.floor(Date.now() / 1000);
  sendJson(res, 200, {
    object: 'list',
    data: MODEL_CATALOG.map((id) => ({ id, object: 'model', created, owned_by: 'openai' })),
  });
}

function usesServerReplayState(body: JsonRecord): boolean {
  if (typeof body.previous_response_id === 'string') return true;
  if (!Array.isArray(body.input)) return false;
  return body.input.some((item) => isRecord(item) && item.type === 'item_reference' && typeof item.id === 'string');
}

function normalizeCodexResponsesBody(body: JsonRecord): JsonRecord {
  const normalized: JsonRecord = { ...body };
  normalized.instructions = typeof normalized.instructions === 'string' ? normalized.instructions : '';
  if (normalized.store === undefined) normalized.store = false;
  normalized.stream = true;
  delete normalized.max_output_tokens;
  return normalized;
}

function buildUpstreamHeaders(auth: CodexAuth): Headers {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  headers.set('authorization', `Bearer ${auth.accessToken}`);
  if (auth.accountId) headers.set('chatgpt-account-id', auth.accountId);
  headers.set('openai-beta', 'responses=experimental');
  headers.set('originator', ORIGINATOR);
  headers.set('user-agent', USER_AGENT);
  return headers;
}

async function* iterateServerSentEvents(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<{ event?: string; data?: string }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const separator = /\r?\n\r?\n/;
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(separator);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        if (!block.trim()) continue;
        const event: { event?: string; data?: string } = {};
        const dataLines: string[] = [];
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith('event:')) event.event = line.slice(6).trim();
          if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length > 0) event.data = dataLines.join('\n');
        yield event;
      }
    }
    if (buffer.trim()) {
      const dataLines = buffer
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart());
      yield { data: dataLines.join('\n') };
    }
  } finally {
    reader.releaseLock();
  }
}

async function collectCompletedResponseFromSse(stream: ReadableStream<Uint8Array>): Promise<JsonRecord> {
  let latestResponse: JsonRecord | undefined;
  let latestError: unknown;
  for await (const event of iterateServerSentEvents(stream)) {
    if (!event.data) continue;
    try {
      const parsed: unknown = JSON.parse(event.data);
      if (!isRecord(parsed)) continue;
      if (event.event === 'error') {
        latestError = parsed;
        continue;
      }
      if (isRecord(parsed.response)) latestResponse = parsed.response;
    } catch {
      continue;
    }
  }
  if (latestResponse) return latestResponse;
  throw new Error(
    `No completed response found in the Codex stream.${latestError ? ` Last error: ${JSON.stringify(latestError)}` : ''}`
  );
}

async function handleResponses(req: IncomingMessage, res: ServerResponse, maxBodyBytes: number): Promise<void> {
  let auth: CodexAuth;
  try {
    auth = await getFreshAuth();
  } catch (error: unknown) {
    if (error instanceof CodexAuthMissingError) {
      sendError(res, 401, { message: error.message, type: 'codex_auth_missing' });
      return;
    }
    sendError(res, 502, { message: 'Failed to refresh the Codex token.', type: 'codex_token_refresh_failed' });
    return;
  }

  let raw: Buffer;
  try {
    raw = await readBody(req, maxBodyBytes);
  } catch (error: unknown) {
    if (error instanceof PayloadTooLargeError) {
      sendError(res, 413, { message: error.message, type: 'payload_too_large' });
      return;
    }
    sendError(res, 400, { message: 'Failed to read the request body.', type: 'invalid_request' });
    return;
  }
  let parsed: unknown;
  try {
    parsed = raw.length > 0 ? JSON.parse(raw.toString('utf-8')) : {};
  } catch {
    sendError(res, 400, { message: 'The request body must be valid JSON.', type: 'invalid_request' });
    return;
  }
  if (!isRecord(parsed)) {
    sendError(res, 400, { message: 'The request body must be a JSON object.', type: 'invalid_request' });
    return;
  }
  if (usesServerReplayState(parsed)) {
    sendError(res, 400, {
      message: 'This proxy is stateless, so each request must include the full conversation again.',
      type: 'unsupported_replay_state',
    });
    return;
  }

  const wantsStream = parsed.stream === true;
  let upstream: Response;
  try {
    upstream = await fetch(CODEX_RESPONSES_URL, {
      method: 'POST',
      headers: buildUpstreamHeaders(auth),
      body: JSON.stringify(normalizeCodexResponsesBody(parsed)),
    });
  } catch {
    sendError(res, 502, { message: 'Failed to reach the Codex backend.', type: 'codex_upstream_unreachable' });
    return;
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
    });
    res.end(text || JSON.stringify({ error: { message: 'The Codex request failed.', type: 'upstream_error' } }));
    return;
  }

  if (wantsStream) {
    res.writeHead(upstream.status, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    if (!upstream.body) {
      res.end();
      return;
    }
    const stream = Readable.fromWeb(upstream.body);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    return;
  }

  if (!upstream.body) {
    sendError(res, 502, { message: 'The Codex stream ended before any result arrived.', type: 'empty_upstream' });
    return;
  }
  const completed = await collectCompletedResponseFromSse(upstream.body);
  sendJson(res, 200, completed);
}

function requestPath(req: IncomingMessage): string {
  const url = req.url ?? '/';
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

function handleRequest(req: IncomingMessage, res: ServerResponse, maxBodyBytes: number): void {
  const path = requestPath(req);
  const method = req.method ?? 'GET';

  if (method === 'GET' && path.endsWith('/healthz')) {
    sendJson(res, 200, { status: 'ok' });
    return;
  }
  if (method === 'GET' && path.endsWith('/models')) {
    handleModels(res);
    return;
  }
  if (method === 'POST' && path.endsWith('/responses')) {
    handleResponses(req, res, maxBodyBytes).catch(() => {
      if (res.headersSent) res.destroy();
      else sendError(res, 500, { message: 'Internal proxy error.', type: 'codex_proxy_error' });
    });
    return;
  }
  sendError(res, 404, { message: 'Not found.', type: 'not_found' });
}

export function startServer(): void {
  const port = resolvePort();
  const maxBodyBytes = resolveMaxBodyBytes();
  const server = createServer((req, res) => handleRequest(req, res, maxBodyBytes));
  server.listen(port, () => {
    process.stdout.write(`codex-proxy listening on port ${port}\n`);
  });
}
