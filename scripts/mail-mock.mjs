#!/usr/bin/env node
import { createServer } from 'node:http';

const PORT = Number.parseInt(process.env.MAIL_MOCK_PORT ?? '8089', 10);

const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  let bytes = 0;
  req.on('data', (chunk) => {
    bytes += chunk.length;
  });
  req.on('end', () => {
    process.stdout.write(`[mail-mock] ${req.method} ${req.url} — swallowed ${bytes} bytes\n`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'local-mail-mock', message: 'Queued. Thank you.' }));
  });
});

server.on('error', (error) => {
  process.stderr.write(`mail mock failed to start on :${PORT} — ${error.message}\n`);
  process.exitCode = 1;
});

server.listen(PORT, () => {
  process.stdout.write(`mail mock listening on :${PORT} (swallows every send, 200s the healthz probe)\n`);
});
