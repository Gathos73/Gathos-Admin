import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/catalog-inline-drafts.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const drafts = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('serializes staged plan limits without client-only keys', () => {
  const limit = drafts.newPlanLimitDraft('local-key');
  Object.assign(limit, {
    code: 'video_daily',
    limitValue: '12',
    productIds: ['product-id'],
    scope: 'selected_products',
  });
  const result = drafts.serializePlanLimitDrafts([limit], ['product-id']);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.rows, [{
    code: 'video_daily',
    metric: 'accepted_generations',
    scope: 'selected_products',
    product_ids: ['product-id'],
    window_type: 'calendar_day',
    window_seconds: null,
    limit_value: 12,
  }]);
});

test('rejects duplicate limits and products outside the draft plan', () => {
  const first = drafts.newPlanLimitDraft('one');
  Object.assign(first, { code: 'daily_limit', limitValue: '1' });
  const duplicate = { ...first, draftKey: 'two' };
  assert.match(
    drafts.serializePlanLimitDrafts([first, duplicate], []).error,
    /duplicated/,
  );
  Object.assign(duplicate, {
    code: 'scoped_limit',
    productIds: ['missing-product'],
    scope: 'selected_products',
  });
  assert.match(
    drafts.serializePlanLimitDrafts([duplicate], []).error,
    /belong to the plan/,
  );
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
