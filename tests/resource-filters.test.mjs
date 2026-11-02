import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function compile(source, dependencies = {}) {
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText)(id => dependencies[id] ?? {}, loaded, loaded.exports);
  return loaded.exports;
}
const managerSource = await readFile(new URL('../components/resource-manager.tsx', import.meta.url), 'utf8');
const panelSource = await readFile(new URL('../components/resource-filters.tsx', import.meta.url), 'utf8');
const catalog = compile(await readFile(new URL('../lib/catalog-resources.ts', import.meta.url), 'utf8'));
const subscriptions = compile(await readFile(new URL('../lib/subscription-resource.ts', import.meta.url), 'utf8'));
const { RESOURCE_CONFIGS } = compile(await readFile(new URL('../lib/resources.ts', import.meta.url), 'utf8'), {
  './catalog-resources': catalog, './subscription-resource': subscriptions,
});

for (const resourceKey of ['users', 'entitlements', 'plans', 'products', 'generations', 'api_keys', 'priority_support_requests']) {
  test(`${resourceKey}: draft edits, reset and dismiss never load records; explicit apply loads once`, async (t) => {
    const config = RESOURCE_CONFIGS[resourceKey];
    const instances = new Map();
    let current, cursor, effects = [], params = new URLSearchParams('page=3');
    const requests = [], navigations = [];
    const data = { rows: [], pagination: { total: 0, has_more: false } };
    globalThis.document = { body: { style: {} }, addEventListener() {}, removeEventListener() {} };
    globalThis.window = { requestAnimationFrame() {}, history: { replaceState(_data, _unused, url) {
      navigations.push(url);
      params = new URL(url, 'http://localhost').searchParams;
    } } };
    t.after(() => { delete globalThis.document; delete globalThis.window; });
    const react = {
      useState(initial) {
        const slot = cursor++, slots = current;
        if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
        return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
      },
      useRef(initial) { const [ref] = react.useState({ current: initial }); return ref; },
      useMemo: fn => fn(), useCallback: fn => fn,
      useEffect(fn, deps) {
        const slot = cursor++;
        if (!current[slot] || deps.some((dep, i) => !Object.is(dep, current[slot][i]))) effects.push(fn);
        current[slot] = deps;
      },
    };
    const common = {
      react, 'react/jsx-runtime': require('react/jsx-runtime'),
      './use-dialog-focus': { useDialogFocus: () => ({ current: null }) },
    };
    const { ResourceFilters } = compile(panelSource, { ...common, 'react-dom': { createPortal: node => node } });
    const { ResourceManager } = compile(managerSource, {
      ...common,
      './resource-filters': { ResourceFilters },
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
    });
    let tree;
    function renderComponent(Component, props, key) {
      current = instances.get(key) ?? [];
      instances.set(key, current);
      cursor = 0;
      return Component(props);
    }
    function expand(node) {
      if (Array.isArray(node)) return node.map(expand);
      if (!node?.props) return node;
      if (node.type === ResourceFilters) return expand(renderComponent(ResourceFilters, node.props, `panel:${node.key}`));
      return { ...node, props: { ...node.props, children: expand(node.props.children) } };
    }
    async function render() {
      for (let i = 0; i < 3; i++) {
        tree = expand(renderComponent(ResourceManager, { resourceKey, initialData: data }, 'manager'));
        const pending = effects; effects = [];
        pending.forEach(fn => fn());
        await Promise.resolve();
      }
    }
    function find(predicate, node) {
      if (arguments.length === 1) node = tree;
      if (Array.isArray(node)) return node.map(child => find(predicate, child)).find(Boolean);
      if (!node?.props) return undefined;
      return predicate(node) ? node : find(predicate, node.props.children);
    }
    const input = label => find(node => node.props['aria-label'] === label);
    const button = text => find(node => node.type === 'button' && node.props.children === text);
    const click = async node => { assert.ok(node); node.props.onClick(); await render(); };
    const change = async (label, value) => { assert.ok(input(label), label); input(label).props.onChange({ target: { value } }); await render(); };
    const submit = async className => { find(node => node.type === 'form' && node.props.className === className).props.onSubmit({ preventDefault() {} }); await render(); };
    const rowRequests = () => requests.filter(request => request.resource === resourceKey);
    const toggle = () => find(node => node.props['aria-controls'] === 'resource-filter-dialog');
    await render();
    const initialRequests = requests.length;
    const filter = config.filters.find(filter => filter.options?.length) ?? config.filters[0];
    await click(toggle());
    const firstOption = field => find(node => node.type === 'option' && node.props.value, input(field.label))?.props.value ?? '00000000-0000-0000-0000-000000000000';
    const value = firstOption(filter);
    await change(filter.label, value);
    await change('Created from', '2026-10-01T00:00');
    await change('Created until', '2026-10-29T00:00');
    assert.equal(requests.length, initialRequests);
    await click(input('Close filters'));
    await click(toggle());
    assert.equal(input(filter.label).props.value, '');
    assert.equal(input('Created from').props.value, '');
    await change(filter.label, value);
    const secondFilter = config.filters.find(item => item !== filter);
    const secondValue = firstOption(secondFilter);
    await change(secondFilter.label, secondValue);
    await change('Created from', '2026-10-01T00:00');
    await change('Created until', '2026-10-29T00:00');
    await submit('resource-filter-form');
    assert.equal(rowRequests().length, 1);
    assert.equal(params.has('page'), false);
    assert.deepEqual(rowRequests()[0].query.filters, { [filter.name]: value, [secondFilter.name]: secondValue });
    assert.equal(rowRequests()[0].query.createdFrom, new Date('2026-10-01T00:00').toISOString());
    assert.equal(toggle().props['aria-expanded'], false);
    await change('Search field', config.searchFields[1].value);
    await change(`Search ${config.label}`, 'Alice');
    assert.equal(rowRequests().length, 1);
    await submit('search-form resource-search');
    assert.equal(rowRequests().length, 2);
    assert.equal(rowRequests()[1].query.search, 'Alice');
    assert.deepEqual(rowRequests()[1].query.filters, rowRequests()[0].query.filters);
    await click(toggle());
    await click(button('Reset'));
    assert.equal(rowRequests().length, 2);
    await submit('resource-filter-form');
    assert.equal(rowRequests().length, 3);
    assert.deepEqual(rowRequests()[2].query.filters, {});
    assert.equal(rowRequests()[2].query.createdFrom, '');
    assert.equal(rowRequests()[2].query.search, 'Alice');
    await click(button('Clear all'));
    assert.equal(rowRequests().length, 4);
    assert.equal(rowRequests()[3].query.search, undefined);
    assert.equal(navigations.length, 4);
    const quickGroup = find(node => node.props.role === 'group');
    const quickChoice = find(node => node.type === 'button' && node.props.children !== 'All', quickGroup);
    await click(quickChoice);
    assert.equal(rowRequests().length, 5);
    assert.equal(Object.keys(rowRequests()[4].query.filters).length, 1);
  });
}
