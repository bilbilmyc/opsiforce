import { homedir } from 'node:os';
import { join } from 'node:path';

export const ISSUER = process.env.CODEX_PROXY_ISSUER ?? 'https://auth.openai.com';
export const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const CODEX_RESPONSES_URL =
  process.env.CODEX_PROXY_RESPONSES_URL ?? 'https://chatgpt.com/backend-api/codex/responses';

export const DEVICE_VERIFICATION_URL = `${ISSUER}/codex/device`;
export const DEVICE_USERCODE_URL = `${ISSUER}/api/accounts/deviceauth/usercode`;
export const DEVICE_TOKEN_URL = `${ISSUER}/api/accounts/deviceauth/token`;
export const OAUTH_TOKEN_URL = `${ISSUER}/oauth/token`;
export const DEVICE_REDIRECT_URI = `${ISSUER}/deviceauth/callback`;

export const ORIGINATOR = process.env.CODEX_PROXY_ORIGINATOR ?? 'codex_cli_rs';
export const USER_AGENT = process.env.CODEX_PROXY_USER_AGENT ?? 'opsiforce-codex-proxy';

export const AUTH_FILE = process.env.CODEX_AUTH_FILE ?? join(homedir(), '.opsiforce', 'codex-auth.json');

const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024;

export function resolveMaxBodyBytes(): number {
  const raw = process.env.CODEX_PROXY_MAX_BODY_BYTES;
  if (raw === undefined || raw === '') return DEFAULT_MAX_BODY_BYTES;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`CODEX_PROXY_MAX_BODY_BYTES must be a positive integer (got "${raw}").`);
  }
  return parsed;
}

export const TOKEN_REFRESH_SKEW_MS = 60_000;
export const DEVICE_POLL_SAFETY_MARGIN_MS = 3000;

export const MODEL_CATALOG: readonly string[] = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.3-codex-spark',
  'gpt-5.2',
  'codex-auto-review',
];

const DEFAULT_PORT = 8455;

export function resolvePort(): number {
  const raw = process.env.CODEX_PROXY_PORT;
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(`CODEX_PROXY_PORT must be a valid port number (got "${raw}").`);
  }
  return parsed;
}
