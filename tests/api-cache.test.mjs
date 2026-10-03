import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { clearRequestCache } from '../lib/request-cache.ts';

const source = await readFile(new URL('../lib/api.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replaceAll('"./request-cache"', JSON.stringify(new URL('../lib/request-cache.ts', import.meta.url).href));
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('subscription filter options share one request and seed the public plan cache', async (t) => {
  globalThis.window = {};
  t.after(() => { delete globalThis.window; clearRequestCache(); });
  const isolated = await import(`data:text/javascript;base64,${Buffer.from(compiled + '\n// subscription options document').toString('base64')}`);
  const options = {
    status: [{ value: 'on_hold', label: 'On hold' }],
    plan_code: [{ value: 'team_v2', label: 'Team Access' }],
    source: [{ value: 'complimentary', label: 'Complimentary' }],
  };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (path) => {
    assert.equal(path, '/api/backend/api/admin/resources/entitlements/filter-options');
    calls++;
    return Response.json(options);
  });
  assert.deepEqual(await Promise.all([
    isolated.getSubscriptionFilterOptions(), isolated.getSubscriptionFilterOptions(),
  ]), [options, options]);
  clearRequestCache();
  assert.deepEqual(await isolated.getSubscriptionFilterOptions(), options);
  assert.deepEqual(await isolated.getPublicPlanOptions(), options.plan_code);
  assert.equal(calls, 1);
});

test('public plan options paginate, deduplicate, and survive cache clears until a document reload', async (t) => {
  globalThis.window = {};
  t.after(() => { delete globalThis.window; clearRequestCache(); });
  let calls = 0;
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async (path) => {
    calls++;
    const params = new URL(path, 'http://localhost').searchParams;
    assert.equal(params.get('filter_by'), 'is_public');
    assert.equal(params.get('filter_value'), 'true');
    const page = Number(params.get('page'));
    return Response.json({
      rows: page === 1 ? [
        { code: 'public_one', display_name: 'Team Access', is_public: true },
        { code: 'private_one', display_name: 'Private Access', is_public: false },
      ] : [{ code: 'public_two', display_name: 'Creator Studio', is_public: true }],
      pagination: { has_more: page === 1 },
    });
  });
  const expected = [
    { value: 'public_one', label: 'Team Access' },
    { value: 'public_two', label: 'Creator Studio' },
  ];
  const results = await Promise.all([api.getPublicPlanOptions(), api.getPublicPlanOptions()]);
  assert.deepEqual(results, [expected, expected]);
  assert.equal(calls, 2);
  clearRequestCache();
  now += 24 * 60 * 60 * 1000;
  assert.deepEqual(await api.getPublicPlanOptions(), expected);
  assert.equal(calls, 2);
  // A fresh module represents the memory reset on a full document reload.
  const reloaded = await import(`data:text/javascript;base64,${Buffer.from(compiled + '\n// reloaded document').toString('base64')}`);
  assert.deepEqual(await reloaded.getPublicPlanOptions(), expected);
  assert.equal(calls, 4);
});

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

test('GPU health refreshes always request a fresh collector snapshot', async (t) => {
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
