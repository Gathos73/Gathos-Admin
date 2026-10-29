import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function load(path, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports,
    name => dependencies[name] ?? require(name));
  return loaded.exports;
}
function find(node, predicate) {
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  if (!node?.props) return undefined;
  return predicate(node) ? node : find(node.props.children, predicate);
}
const { RESOURCE_CONFIGS } = await load('../lib/resources.ts', {
  './debugging-resources': { DEBUGGING_CONFIGS: {} },
  './catalog-resources': { CATALOG_CONFIGS: {} },
  './subscription-resource': { SUBSCRIPTION_CONFIG: {} },
});
const config = RESOURCE_CONFIGS.users;
const field = config.fields.find(field => field.name === 'plan');

test('No access is selectable without a free catalog row and submits access removal', async () => {
  const slots = [];
  let cursor = 0;
  const react = {
    useMemo: fn => fn(),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
  };
  const { RecordForm } = await load('../components/record-form.tsx', {
    react,
    '../lib/readonly-fields': { readOnlyFields: () => [] },
    './readonly-item-list': { ReadOnlyItemList: 'ReadOnlyItemList', selectedItemsFromRecord: () => [] },
    './relation-field': { RelationField: 'RelationField' },
  });
  let submitted;
  const render = () => {
    cursor = 0;
    return RecordForm({ config, mode: 'edit', initialRecord: {
      id: 'user', email: 'user@example.test', plan: 'pro', is_comped: false,
    }, onSubmit: async payload => { submitted = payload; } });
  };
  let tree = render();
  const selector = find(tree, node => node.type === 'RelationField' && node.props.field.name === 'plan');
  assert.deepEqual(selector.props.field.options, [{ value: 'free', label: 'No access' }]);
  selector.props.onChange('free');
  tree = render();
  await tree.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(submitted, { plan: 'free' });
});

for (const rows of [[], [{ id: 'legacy', code: 'free', display_name: 'Free' }],
  [{ id: 'retired', code: 'free', display_name: 'Free', retired_at: '2026-10-29' }]]) {
  test(`relation choices keep one No access option with ${JSON.stringify(rows)}`, async () => {
    const slots = [];
    let cursor = 0;
    const effects = [];
    const { RelationField } = await load('../components/relation-field.tsx', {
      react: {
        useEffect: fn => effects.push(fn),
        useState(initial) {
          const index = cursor++;
          if (!(index in slots)) slots[index] = initial;
          return [slots[index], value => { slots[index] = value; }];
        },
      },
      '@/lib/api': { listResource: async () => ({ rows, pagination: { has_more: false } }) },
      '@/lib/catalog-inline-drafts': { cacheProducts() {} },
      './transfer-list': { TransferList: 'TransferList' },
    });
    RelationField({ field, value: 'free', onChange() {}, disabled: false });
    effects[0]();
    await new Promise(resolve => setImmediate(resolve));
    cursor = 0;
    const tree = RelationField({ field, value: 'free', onChange() {}, disabled: false });
    const select = find(tree, node => node.type === 'select');
    assert.equal(select.props.disabled, false);
    const options = select.props.children[1];
    assert.equal(options.filter(option => option.props.value === 'free').length, 1);
    assert.equal(options.find(option => option.props.value === 'free').props.children, 'No access');
  });
}
