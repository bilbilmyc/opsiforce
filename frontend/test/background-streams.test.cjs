const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Exercise the two actual persistent platform stream hooks per tab.
test('background project tabs release streams so files and project creation have a connection', () => {
  let active = 0;
  const old = { document: global.document, window: global.window, EventSource: global.EventSource, localStorage: global.localStorage };
  class Source extends EventTarget { constructor() { super(); active++; this.closed = false; } close() { if (!this.closed) { this.closed = true; active--; } } }
  const tabs = [];
  try {
    global.EventSource = Source;
    global.localStorage = { getItem: () => '' };
    for (let i = 0; i < 3; i++) {
      const document = new EventTarget(); document.visibilityState = 'visible';
      const window = new EventTarget(); window.location = { protocol: 'https:', href: 'https://test.invalid/' };
      global.document = document; global.window = window;
      const cleanups = [];
      const mocks = {
        'solid-js': { createEffect: fn => fn(), onCleanup: fn => cleanups.push(fn), createSignal: value => [() => value, next => { value = next; }] },
        'solid-js/store': { createStore: () => [{}, () => {}] },
        '~/lib/tenant-state': { createTenantState: () => [() => 'local'] },
        '@tanstack/solid-query': { useQueryClient: () => ({ invalidateQueries() {} }) },
        '~/i18n': { t: value => value },
      };
      const cache = new Map();
      function load(file) {
        if (cache.has(file)) return cache.get(file);
        const module = { exports: {} }; cache.set(file, module.exports);
        const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
        new Function('require','module','exports',result.outputText)(name => {
          if (mocks[name]) return mocks[name];
          if (name === '~/lib/visible-stream') return load(path.resolve(__dirname, '../src/lib/visible-stream.ts'));
          if (name === '~/lib/status-source') return load(path.resolve(__dirname, '../src/lib/status-source.ts'));
          return {};
        }, module, module.exports);
        return module.exports;
      }
      load(path.resolve(__dirname, '../src/api/agent-status.ts')).useAgentStatusStream(() => []);
      load(path.resolve(__dirname, '../src/api/projects.ts')).useProjectStatus(() => 'project-' + i);
      tabs.push({ document, window, cleanups });
      if (i < 2) { document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); }
    }
    assert.equal(active, 2, 'only the foreground tab may retain its two platform streams');
    assert.ok(active < 6, 'HTTP/1 requests for files and creation must not wait behind six streams');
    const first = tabs[0], last = tabs[2];
    last.document.visibilityState = 'hidden'; last.document.dispatchEvent(new Event('visibilitychange'));
    first.document.visibilityState = 'visible'; first.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(active, 2, 'switching tabs resumes one set of current-state subscriptions');
    first.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(active, 2, 'repeated visibility events cannot duplicate subscriptions');
    first.window.dispatchEvent(new Event('pagehide'));
    assert.equal(active, 0);
    first.window.dispatchEvent(new Event('pageshow'));
    assert.equal(active, 2);
  } finally {
    for (const tab of tabs) for (const cleanup of tab.cleanups) cleanup();
    Object.assign(global, old);
  }
  assert.equal(active, 0, 'unmount closes all connections');
});

test('HTTP status snapshots use finite requests for multiple visible tabs and cancel on disposal', async () => {
  const old = {window:global.window, fetch:global.fetch, EventSource:global.EventSource};
  const file = path.resolve(__dirname,'../src/lib/status-source.ts');
  const module = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(require,module,module.exports);
  const sources = [], requests = [], received = [];
  const tick = () => new Promise(resolve=>setImmediate(resolve));
  try {
    global.window = {location:{protocol:'http:',href:'http://test.invalid/'}};
    global.EventSource = class {constructor(){throw new Error('HTTP must not retain native status SSE connections');}};
    global.fetch = async (url,{signal}) => {requests.push({url,signal}); return {ok:true,json:async()=>[{projectId:'one',agentStatus:'working'}]};};
    for(let i=0;i<3;i++) {
      const source=module.exports.createStatusSource('/api/agent-status/events?tenant=local');
      source.onmessage=event=>received.push(JSON.parse(event.data));sources.push(source);
      const job=module.exports.createStatusSource('/api/projects/one/duplicate/job/stream?tenant=local');sources.push(job);
    }
    await tick();
    assert.equal(requests.length,6);assert.equal(received.length,3);
    assert.ok(requests.every(request=>!request.url.includes('/stream')));
    assert.equal(requests[0].url,'/api/agent-status/events?tenant=local&snapshot=1');
    assert.equal(requests[1].url,'/api/projects/one/duplicate/job?tenant=local');
    sources.forEach(source=>source.close());
    assert.ok(requests.every(request=>request.signal.aborted));
  } finally {sources.forEach(source=>source.close());Object.assign(global,old);}
});
