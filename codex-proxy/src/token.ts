import { TOKEN_REFRESH_SKEW_MS } from './config.ts';
import { readAuth, writeAuth } from './auth-file.ts';
import type { CodexAuth } from './auth-file.ts';
import { extractAccountId, refreshAccessToken } from './oauth.ts';

export class CodexAuthMissingError extends Error {}

let inFlightRefresh: Promise<CodexAuth> | undefined;

function isExpired(auth: CodexAuth): boolean {
  return Date.now() >= auth.expiresAt - TOKEN_REFRESH_SKEW_MS;
}

async function refreshAndPersist(auth: CodexAuth): Promise<CodexAuth> {
  const tokens = await refreshAccessToken(auth.refreshToken);
  const next: CodexAuth = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? auth.refreshToken,
    accountId: extractAccountId(tokens) ?? auth.accountId,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  };
  await writeAuth(next);
  return next;
}

export async function getFreshAuth(): Promise<CodexAuth> {
  const auth = await readAuth();
  if (!auth) {
    throw new CodexAuthMissingError('No Codex token found. Run the codex-proxy login command first.');
  }
  if (!isExpired(auth)) return auth;
  if (!inFlightRefresh) {
    inFlightRefresh = refreshAndPersist(auth).finally(() => {
      inFlightRefresh = undefined;
    });
  }
  return inFlightRefresh;
}
