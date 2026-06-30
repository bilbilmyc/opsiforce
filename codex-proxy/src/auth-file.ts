import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AUTH_FILE } from './config.ts';

export interface CodexAuth {
  accessToken: string;
  refreshToken: string;
  accountId?: string;
  expiresAt: number;
}

function isCodexAuth(value: unknown): value is CodexAuth {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.accessToken === 'string' &&
    typeof record.refreshToken === 'string' &&
    typeof record.expiresAt === 'number' &&
    (record.accountId === undefined || typeof record.accountId === 'string')
  );
}

export async function readAuth(): Promise<CodexAuth | undefined> {
  let raw: string;
  try {
    raw = await readFile(AUTH_FILE, 'utf8');
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return isCodexAuth(parsed) ? parsed : undefined;
}

export async function writeAuth(auth: CodexAuth): Promise<void> {
  await mkdir(dirname(AUTH_FILE), { recursive: true });
  await writeFile(AUTH_FILE, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  await chmod(AUTH_FILE, 0o600);
}
