import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { cachedRequest, clearRequestCache } from '../lib/request-cache.ts';

beforeEach(() => clearRequestCache());

test('reuses navigation results for five minutes and separates query keys', async (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  let calls = 0;
  const load = async () => ++calls;
  assert.equal(await cachedRequest('/rows?page=1', load), 1);
  now += 299999;
  assert.equal(await cachedRequest('/rows?page=1', load), 1);
  assert.equal(await cachedRequest('/rows?page=2', load), 2);
  now += 1;
  assert.equal(await cachedRequest('/rows?page=1', load), 3);
});

test('deduplicates pending requests while allowing a page to cancel independently', async () => {
  let finish;
  let calls = 0;
  const load = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const controller = new AbortController();
  const first = cachedRequest('/rows', load, controller.signal);
  const second = cachedRequest('/rows', load);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  controller.abort();
  finish({ rows: [1] });
  await rejected;
  assert.deepEqual(await second, { rows: [1] });
  assert.equal(calls, 1);
});

test('invalidation prevents an older request from replacing refreshed data', async () => {
  let finish;
  const old = cachedRequest('/rows', () => new Promise(resolve => { finish = resolve; }));
  clearRequestCache();
  assert.equal(await cachedRequest('/rows', async () => 'new'), 'new');
  finish('old');
  await old;
  assert.equal(await cachedRequest('/rows', async () => 'unexpected'), 'new');
});

test('failed requests are retried and already-aborted requests do not fetch', async () => {
  await assert.rejects(cachedRequest('/rows', async () => { throw new Error('offline'); }));
  assert.equal(await cachedRequest('/rows', async () => 'online'), 'online');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(cachedRequest('/other', async () => assert.fail('must not fetch'), controller.signal));
});

test('bounds cache retention', async () => {
  for (let index = 0; index < 101; index++) await cachedRequest(String(index), async () => index);
  assert.equal(await cachedRequest('0', async () => 'reloaded'), 'reloaded');
});

test('forced polling updates the cached result used on the next navigation', async () => {
  assert.equal(await cachedRequest('/job', async () => 'pending'), 'pending');
  assert.equal(await cachedRequest('/job', async () => 'complete', undefined, true), 'complete');
  assert.equal(await cachedRequest('/job', async () => 'unexpected'), 'complete');
});
