import { spawn } from 'node:child_process';
import { AUTH_FILE, DEVICE_VERIFICATION_URL } from './config.ts';
import { writeAuth } from './auth-file.ts';
import {
  exchangeAuthorizationCode,
  extractAccountId,
  pollForAuthorizationCode,
  startDeviceAuthorization,
} from './oauth.ts';

function openBrowser(url: string): void {
  const child = spawn('open', [url], { stdio: 'ignore', detached: true });
  child.on('error', () => undefined);
  child.unref();
}

export async function runLogin(): Promise<void> {
  const device = await startDeviceAuthorization();
  process.stdout.write(
    `\nOpen ${DEVICE_VERIFICATION_URL} in your browser and enter this code:\n\n    ${device.userCode}\n\n`
  );
  openBrowser(DEVICE_VERIFICATION_URL);

  process.stdout.write('Waiting for you to finish signing in…\n');
  const code = await pollForAuthorizationCode(device.deviceAuthId, device.userCode, device.intervalMs);
  const tokens = await exchangeAuthorizationCode(code);

  await writeAuth({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? '',
    accountId: extractAccountId(tokens),
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  });

  process.stdout.write(`Signed in. Token saved to ${AUTH_FILE}\n`);
}
