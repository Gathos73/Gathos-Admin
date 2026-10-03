import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../components/resource-manager.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const require = createRequire(import.meta.url);
const subscriptionSource = await readFile(new URL('../lib/subscription-resource.ts', import.meta.url), 'utf8');
const subscriptionModule = { exports: {} };
new Function('module', 'exports', ts.transpileModule(subscriptionSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(subscriptionModule, subscriptionModule.exports);

for (const resourceKey of ['users', 'entitlements']) {
test(`${resourceKey}: inputs only load rows on submit, without server navigation`, async (t) => {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let params = new URLSearchParams();
  const navigations = [];
  const requests = [];
  const data = { rows: [], pagination: { total: 0 } };
  const config = resourceKey === 'entitlements' ? subscriptionModule.exports.SUBSCRIPTION_CONFIG : {
    label: 'Users', primaryKey: 'id', defaultOrder: 'created_at', defaultDescending: true,
    listDisplay: [{ name: 'created_at', sortable: true }],
    searchFields: [{ label: 'Email', value: 'email' }, { label: 'Name', value: 'name' }],
    filters: [{ name: 'plan', label: 'Plan', options: [] }],
  };
  const planField = resourceKey === 'entitlements' ? 'plan_code' : 'plan';
  const searchField = resourceKey === 'entitlements' ? 'user_name' : 'name';
  globalThis.window = { history: { replaceState(_data, _unused, url) {
    navigations.push(url);
    params = new URL(url, 'http://localhost').searchParams;
  } } };
  t.after(() => { delete globalThis.window; });
  if (resourceKey === 'entitlements') {
    assert.deepEqual(config.filters.map(filter => filter.name), ['status', 'plan_code', 'source']);
    assert.ok(!config.searchFields.some(field => field.value === 'plan_name'));
  }
  // Run the component's hooks and handlers without a browser or child components.
  const dependencies = {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
      },
      useRef: initial => ({ current: initial }),
      useMemo: fn => fn(), useCallback: fn => fn,
      useEffect(fn, deps) {
        const index = cursor++;
        if (!slots[index] || deps.some((dep, i) => !Object.is(dep, slots[index][i]))) effects.push(fn);
        slots[index] = deps;
      },
    },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': {
      usePathname: () => `/${resourceKey}`, useSearchParams: () => params,
      useRouter: () => ({ replace() { assert.fail('query inputs must not trigger server navigation'); } }),
    },
    '@/lib/request-cache': { clearRequestCache() {} },
    '../lib/api': {
      listResource: async (resource, query) => { requests.push({ resource, query }); return data; },
      getPublicPlanOptions: async () => [{ value: 'team_v2', label: 'Team Access' }],
      getSubscriptionFilterOptions: async () => ({
        status: [{ value: 'on_hold', label: 'On hold' }],
        plan_code: [{ value: 'team_v2', label: 'Team Access' }],
        source: [{ value: 'complimentary', label: 'Complimentary' }],
      }),
    },
    '../lib/resources': { getResourceConfig: () => config },
    '../lib/catalog-inline-drafts': { EMPTY_CATALOG_INLINE_DRAFTS: { planLimits: [], productRoutes: [] } },
    './toast': { useToast: () => ({ toasts: [], pushToast() {}, dismissToast() {} }) },
    './use-dialog-focus': { useDialogFocus: () => ({ current: null }) },
  };
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(id => dependencies[id] ?? {}, loaded, loaded.exports);
  let tree;
  async function render() {
    for (let i = 0; i < 3; i++) {
      cursor = 0;
      tree = loaded.exports.ResourceManager({ resourceKey, initialData: data });
      const pending = effects;
      effects = [];
      pending.forEach(fn => fn());
      await Promise.resolve();
    }
  }
  function find(predicate, node) {
    if (Array.isArray(node)) return node.map(child => find(predicate, child)).find(Boolean);
    if (!node?.props) return undefined;
    return predicate(node) ? node : find(predicate, node.props.children);
  }
  const input = label => find(node => node.props['aria-label'] === label, tree);
  const change = async (label, value) => { input(label).props.onChange({ target: { value } }); await render(); };
  const submit = async className => {
    find(node => node.type === 'form' && node.props.className === className, tree).props.onSubmit({ preventDefault() {} });
    await render();
  };

  await render();
  if (resourceKey === 'entitlements') {
    await change('Filter field', 'status');
    assert.equal(input('Filter value').props.children[1][0].props.children, 'On hold');
    await change('Filter field', 'source');
    assert.equal(input('Filter value').props.children[1][0].props.children, 'Complimentary');
  }
  await change('Filter field', planField);
  assert.equal(input('Filter value').props.children[1][0].props.children, 'Team Access');
  await change('Filter value', 'team_v2');
  assert.equal(navigations.length, 0);
  assert.equal(requests.length, 0);
  await submit('filter-form');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].query.filterBy, planField);
  assert.equal(requests[0].query.filterValue, 'team_v2');

  await change('Search field', searchField);
  await change(`Search ${config.label}`, 'Alice');
  assert.equal(requests.length, 1);
  assert.equal(navigations.length, 1);
  await submit('search-form');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].query.searchField, searchField);
  assert.equal(requests[1].query.search, 'Alice');
  assert.equal(requests[1].query.filterValue, 'team_v2');

  find(node => node.type === 'button' && node.props.children === 'Clear', tree).props.onClick();
  await render();
  assert.equal(requests.length, 2);
  await submit('filter-form');
  assert.equal(requests.length, 3);
  assert.equal(requests[2].query.filterBy, undefined);
});
}
