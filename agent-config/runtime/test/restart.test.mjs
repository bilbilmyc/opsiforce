import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { restartApp } from '../restart.mjs';

async function fixture(t, handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const port = String(server.address().port);
  return { CONTROL_PORT: port, APP_PORT: port, OPSIFORCE_CONTROL_TOKEN: 'test-secret' };
}

test('restart authenticates locally and waits for application readiness', async t => {
  let checks = 0;
  const env = await fixture(t, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/restart-app') {
      assert.equal(req.method, 'POST');
      assert.equal(req.headers['x-control-token'], 'test-secret');
      res.end('{"killed":2}');
    } else { res.end(JSON.stringify({ status: ++checks > 1 ? 'ok' : 'starting' })); }
  });
  assert.deepEqual(await restartApp(env, { timeoutMs: 1000, intervalMs: 5 }), { status: 'ready', restartedProcesses: 2 });
  assert.equal(checks, 2);
});

test('restart distinguishes absent supervision, unavailable control and failed health without leaking secrets', async t => {
  for (const [reply, expected] of [[{ killed: 0 }, 'APP_NOT_SUPERVISED'], [{ killed: 1 }, 'APP_NOT_READY'], [null, 'RESTART_FAILED']]) {
    const env = await fixture(t, (req, res) => {
      if (req.url === '/restart-app' && reply) res.end(JSON.stringify(reply));
      else { res.statusCode = 503; res.end('test-secret'); }
    });
    await assert.rejects(restartApp(env, { timeoutMs: 30, intervalMs: 5 }), error => error.code === expected && !error.message.includes('test-secret'));
  }
  await assert.rejects(restartApp({}), { code: 'CONTROL_UNAVAILABLE' });
  await assert.rejects(restartApp({ OPSIFORCE_CONTROL_TOKEN: 'test-secret', CONTROL_PORT: '../x' }), { code: 'INVALID_PORT' });
});
