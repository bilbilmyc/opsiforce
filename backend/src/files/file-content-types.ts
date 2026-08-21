import path from 'path';

const CONTENT_TYPES: Record<string, string> = {
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const INLINE_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'text/plain; charset=utf-8',
  'text/markdown; charset=utf-8',
  'text/csv; charset=utf-8',
  'text/tab-separated-values; charset=utf-8',
  'application/json; charset=utf-8',
  'text/html; charset=utf-8',
]);

const SANDBOXED_CONTENT_TYPES = new Set(['text/html; charset=utf-8']);

const SANDBOX_POLICY = [
  'sandbox allow-scripts',
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
].join('; ');

export const FALLBACK_CONTENT_TYPE = 'application/octet-stream';

export type Disposition = 'inline' | 'attachment';

export function resolveContentType(filename: string): string {
  return CONTENT_TYPES[path.extname(filename).toLowerCase()] ?? FALLBACK_CONTENT_TYPE;
}

export function resolveDisposition(contentType: string): Disposition {
  return INLINE_CONTENT_TYPES.has(contentType) ? 'inline' : 'attachment';
}

export function resolveSandboxPolicy(contentType: string): string | null {
  return SANDBOXED_CONTENT_TYPES.has(contentType) ? SANDBOX_POLICY : null;
}

export function contentDisposition(filename: string, disposition: Disposition): string {
  return `${disposition}; filename="${asciiFallbackFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function asciiFallbackFilename(filename: string): string {
  return filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
}
