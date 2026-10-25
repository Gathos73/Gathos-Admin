import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import ts from 'typescript';

const source = await readFile(new URL('../lib/catalog-inline-drafts.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const require = createRequire(import.meta.url);
const loaded = { exports: {} };
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, (name) => {
  if (name === './api') return { listResource() { throw new Error('Draft serialization must not fetch resources'); } };
  return require(name);
});
const drafts = loaded.exports;

test('serializes product limits without client-only fields and preserves zero versus unlimited', () => {
  const limit = drafts.newProductLimitDraft('local-key', 'product-id', 'video', 'Video');
  Object.assign(limit, { fixedWindowLimit: '12', queueDepthLimit: '0', concurrencyLimit: '' });
  const result = drafts.serializePlanLimitDrafts([limit], ['product-id']);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.rows, [{
    product_id: 'product-id', fixed_window_limit: 12, queue_depth_limit: 0, concurrency_limit: null,
  }]);
});

test('rejects duplicate products, products outside the plan and invalid concurrency', () => {
  const first = drafts.newProductLimitDraft('one', 'product-id');
  const duplicate = { ...first, draftKey: 'two' };
  assert.match(drafts.serializePlanLimitDrafts([first, duplicate], ['product-id']).error, /one limit block/);
  assert.match(drafts.serializePlanLimitDrafts([first], []).error, /not in the plan/);
  Object.assign(first, { concurrencyLimit: '0' });
  assert.match(drafts.serializePlanLimitDrafts([first], ['product-id'], 1).error, /1 or more/);
});

test('serializes routes and validates route JSON and priority', () => {
  const route = drafts.newProductRouteDraft('route-key');
  Object.assign(route, {
    routeCode: 'primary-route',
    providerCode: 'provider-one',
    priority: '25',
    executorConfig: '{"region":"west"}',
  });
  const result = drafts.serializeProductRouteDrafts([route]);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.rows, [{
    route_code: 'primary-route',
    provider_code: 'provider-one',
    provider_product_code: null,
    execution_pool: null,
    priority: 25,
    credential_secret_name: null,
    executor_config: { region: 'west' },
  }]);

  route.priority = '40000';
  assert.match(drafts.serializeProductRouteDrafts([route]).error, /0 to 32767/);
  route.priority = '25';
  route.executorConfig = '[]';
  assert.match(drafts.serializeProductRouteDrafts([route]).error, /JSON object/);
});
