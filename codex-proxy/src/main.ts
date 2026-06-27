#!/usr/bin/env node
import { runLogin } from './login.ts';
import { startServer } from './server.ts';

const USAGE = `codex-proxy — host LLM proxy for an OpenAI/Codex subscription

Usage:
  codex-proxy            Start the proxy server (default)
  codex-proxy login      Run the device-code login and store a token
  codex-proxy --help     Show this message
`;

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return;
  }
  if (command === 'login') {
    await runLogin();
    return;
  }
  if (command === undefined || command === 'serve' || command === 'start') {
    startServer();
    return;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`codex-proxy error: ${message}\n`);
  process.exitCode = 1;
});
