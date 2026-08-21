import path from 'path';

const CONVERTIBLE_EXTENSIONS = new Set(['.docx', '.pptx']);

export const MAX_CONVERTIBLE_BYTES = 32 * 1024 * 1024;

export function isConvertibleToPdf(filename: string): boolean {
  return CONVERTIBLE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}
