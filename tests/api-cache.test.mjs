import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { clearRequestCache } from '../lib/request-cache.ts';

const source = await readFile(new URL('../lib/api.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replaceAll('"./request-cache"', JSON.stringify(new URL('../lib/request-cache.ts', import.meta.url).href));
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('API reads cache across navigation and mutations invalidate them', async (t) => {
  globalThis.window = {};
  t.after(() => { delete globalThis.window; clearRequestCache(); });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ version: ++calls }));
  const read = () => api.getResourceCount("generations");
  assert.equal((await read()).version, 1);
  assert.equal((await read()).version, 1);
  await api.updateResource({ mutations: { basePath: "/generations" } }, "example", { title: "Updated" });
  assert.equal((await read()).version, 3);
  clearRequestCache();
  assert.equal((await read()).version, 4);
});

test('GPU health refreshes always request a fresh scheduler snapshot', async (t) => {
  globalThis.window = {};
  t.after(() => { delete globalThis.window; clearRequestCache(); });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ version: ++calls }));
  assert.equal((await api.getGpuHealth()).version, 1);
  assert.equal((await api.getGpuHealth()).version, 2);
});

test('registry mutations forward idempotency and revision headers through authenticated BFF', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (path, init) => {
    calls.push({ path, ...init }); return Response.json({ gpu_id: 'gpu-one' });
  });
  await api.createComputeGpu({ name: 'GPU one' }, 'create-attempt');
  await api.updateComputeGpu('gpu-one', { name: 'GPU one' }, '"gpu:gpu-one:revision:3"');
  await api.drainComputeGpu('gpu-one', '"gpu:gpu-one:revision:3"', 'service-one');
  assert.equal(calls[0].headers.get('Idempotency-Key'), 'create-attempt');
  assert.equal(calls[1].headers.get('If-Match'), '"gpu:gpu-one:revision:3"');
  assert.equal(calls[1].method, 'PUT');
  assert.equal(calls[2].path, '/api/backend/api/admin/compute/gpus/gpu-one/services/service-one/drain');
  assert.equal(calls[2].headers.get('If-Match'), '"gpu:gpu-one:revision:3"');
  assert.ok(calls.every((call) => call.credentials === 'include'));
});
