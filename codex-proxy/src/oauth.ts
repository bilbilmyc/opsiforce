import { setTimeout as delay } from 'node:timers/promises';
import {
  CLIENT_ID,
  DEVICE_POLL_SAFETY_MARGIN_MS,
  DEVICE_REDIRECT_URI,
  DEVICE_TOKEN_URL,
  DEVICE_USERCODE_URL,
  OAUTH_TOKEN_URL,
  USER_AGENT,
} from './config.ts';

export interface TokenResponse {
  id_token?: string;
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface DeviceAuthorization {
  deviceAuthId: string;
  userCode: string;
  intervalMs: number;
}

interface DeviceAuthInit {
  device_auth_id: string;
  user_code: string;
  interval?: string;
}

interface DeviceAuthorizationCode {
  authorization_code: string;
  code_verifier: string;
}

interface IdTokenClaims {
  chatgpt_account_id?: string;
  organizations?: { id: string }[];
  'https://api.openai.com/auth'?: { chatgpt_account_id?: string };
}

const JSON_HEADERS = { 'content-type': 'application/json', 'user-agent': USER_AGENT };
const FORM_HEADERS = { 'content-type': 'application/x-www-form-urlencoded' };

export async function startDeviceAuthorization(): Promise<DeviceAuthorization> {
  const response = await fetch(DEVICE_USERCODE_URL, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!response.ok) throw new Error(`Device authorization request failed (${response.status}).`);
  const data = (await response.json()) as DeviceAuthInit;
  const parsedInterval = data.interval ? Number.parseInt(data.interval, 10) : Number.NaN;
  const seconds = Number.isFinite(parsedInterval) ? parsedInterval : 5;
  return {
    deviceAuthId: data.device_auth_id,
    userCode: data.user_code,
    intervalMs: Math.max(seconds, 1) * 1000,
  };
}

export async function pollForAuthorizationCode(
  deviceAuthId: string,
  userCode: string,
  intervalMs: number
): Promise<DeviceAuthorizationCode> {
  for (;;) {
    const response = await fetch(DEVICE_TOKEN_URL, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }),
    });
    if (response.ok) return (await response.json()) as DeviceAuthorizationCode;
    if (response.status !== 403 && response.status !== 404) {
      throw new Error(`Device authorization failed (${response.status}).`);
    }
    await delay(intervalMs + DEVICE_POLL_SAFETY_MARGIN_MS);
  }
}

export async function exchangeAuthorizationCode(code: DeviceAuthorizationCode): Promise<TokenResponse> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code.authorization_code,
      redirect_uri: DEVICE_REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: code.code_verifier,
    }).toString(),
  });
  if (!response.ok) throw new Error(`Token exchange failed (${response.status}).`);
  return (await response.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  });
  if (!response.ok) throw new Error(`Token refresh failed (${response.status}).`);
  return (await response.json()) as TokenResponse;
}

function parseJwtClaims(token: string): IdTokenClaims | undefined {
  const parts = token.split('.');
  const payload = parts.length === 3 ? parts[1] : undefined;
  if (payload === undefined) return undefined;
  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object') return undefined;
    return parsed as IdTokenClaims;
  } catch {
    return undefined;
  }
}

function accountIdFromToken(token: string): string | undefined {
  const claims = parseJwtClaims(token);
  if (!claims) return undefined;
  return (
    claims.chatgpt_account_id ??
    claims['https://api.openai.com/auth']?.chatgpt_account_id ??
    claims.organizations?.[0]?.id
  );
}

export function extractAccountId(tokens: TokenResponse): string | undefined {
  const fromIdToken = tokens.id_token ? accountIdFromToken(tokens.id_token) : undefined;
  return fromIdToken ?? accountIdFromToken(tokens.access_token);
}
