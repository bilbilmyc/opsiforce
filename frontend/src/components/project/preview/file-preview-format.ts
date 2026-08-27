import { fileExtensionOf } from '~/lib/file-extension';

export type FilePreviewKind =
  | 'pdf'
  | 'image'
  | 'svg'
  | 'html'
  | 'csv'
  | 'spreadsheet'
  | 'markdown'
  | 'text'
  | 'office'
  | 'unsupported';

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif']);
const HTML_EXTENSIONS = new Set(['html', 'htm']);
const SPREADSHEET_EXTENSIONS = new Set(['xlsx']);
const OFFICE_EXTENSIONS = new Set(['docx', 'pptx']);
const NEW_TAB_KINDS = new Set<FilePreviewKind>(['pdf', 'image', 'html']);

const TEXT_LANGUAGES: Record<string, string> = {
  txt: 'text',
  log: 'text',
  tsv: 'text',
  env: 'bash',
  bash: 'bash',
  sh: 'bash',
  zsh: 'bash',
  fish: 'fish',
  ps1: 'powershell',
  bat: 'bat',
  ts: 'ts',
  tsx: 'tsx',
  mts: 'ts',
  cts: 'ts',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  json: 'json',
  jsonc: 'jsonc',
  json5: 'json5',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  properties: 'ini',
  xml: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'proto',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  pl: 'perl',
  r: 'r',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
  tf: 'terraform',
  hcl: 'hcl',
  diff: 'diff',
  patch: 'diff',
  mdx: 'mdx',
};

export function fileNameOf(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] || path;
}

export function filePreviewKind(name: string): FilePreviewKind {
  const extension = fileExtensionOf(name);
  if (extension === 'pdf') return 'pdf';
  if (extension === 'svg') return 'svg';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (HTML_EXTENSIONS.has(extension)) return 'html';
  if (extension === 'csv') return 'csv';
  if (SPREADSHEET_EXTENSIONS.has(extension)) return 'spreadsheet';
  if (OFFICE_EXTENSIONS.has(extension)) return 'office';
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown';
  if (extension in TEXT_LANGUAGES) return 'text';
  return 'unsupported';
}

export function isPreviewableFile(name: string): boolean {
  return filePreviewKind(name) !== 'unsupported';
}

export function opensInNewTab(kind: FilePreviewKind): boolean {
  return NEW_TAB_KINDS.has(kind);
}

export function textPreviewLanguage(name: string): string {
  return TEXT_LANGUAGES[fileExtensionOf(name)] ?? 'text';
}
