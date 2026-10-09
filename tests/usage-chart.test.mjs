import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Compile the standalone TSX component so the tests exercise the rendered SVG.
const source = readFileSync(new URL('../components/usage-chart.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
});
const exports = {};
vm.runInNewContext(outputText, { exports, require: createRequire(import.meta.url), Intl, Date });
const { UsageChart, UsageWindow } = exports;
const start = '2026-09-25T08:00:00Z';
const end = '2026-09-25T12:00:00Z';
const point = (date, total) => ({ date, total, image: total, image2image: 0, tts: 0, video: 0 });
const props = {
  series: [point(start, 3), point('2026-09-25T08:10:00Z', 2), point('2026-09-25T08:20:00Z', 999)],
  bucketMinutes: 10, sampledAt: '2026-09-25T08:15:00Z', periodStart: start, periodEnd: end,
};
const render = (overrides = {}) => renderToStaticMarkup(React.createElement(UsageChart, { ...props, ...overrides }));

test('future buckets are not plotted or included in the peak while the full window axis remains', () => {
  const html = render();
  assert.match(html, /Peak interval: 3 requests/);
  assert.equal((html.match(/class="chart-point"/g) ?? []).length, 10);
  // Ten minutes into a four-hour window: x = 38 + (10 / 240) * 728.
  assert.match(html, /C[^"]+ 68\.33 /);
  const localEnd = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(end));
  assert.ok(html.includes(localEnd));
  assert.ok(!html.includes('999 requests'));
});

test('all five smooth lines share one SVG and one scale', () => {
  const html = render();
  assert.equal((html.match(/<svg/g) ?? []).length, 1);
  assert.equal((html.match(/class="chart-line"/g) ?? []).length, 5);
  const paths = Object.fromEntries([...html.matchAll(/data-service="([^"]+)" d="([^"]+)"/g)].map((match) => [match[1], match[2]]));
  assert.equal(paths.all, paths.image);
  for (const service of ['image2image', 'tts', 'video']) {
    assert.match(paths[service], /^M38.00 216.00 C/);
  }
  for (const path of Object.values(paths)) {
    assert.ok(path.includes('C'));
    assert.ok(!path.includes('L'));
  }
});

test('empty and newly opened windows produce finite geometry', () => {
  assert.match(render({ series: [] }), /No intervals available yet/);
  const html = render({ sampledAt: start });
  assert.equal((html.match(/class="chart-point"/g) ?? []).length, 5);
  assert.ok(!/NaN|Infinity/.test(html));
});

test('window labels include both UTC and the local timezone with correct date rollover', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Asia/Kolkata';
  try {
    const html = renderToStaticMarkup(React.createElement(UsageWindow, {
      start: '2026-09-25T20:00:00Z', end: '2026-09-26T00:00:00Z',
    }));
    assert.match(html, /Local \(Asia\/Calcutta\)|Local \(Asia\/Kolkata\)/);
    assert.match(html, /UTC:/);
    assert.match(html, /Sep 26, 1:30 AM/);
    assert.match(html, /Sep 25, 8:00 PM/);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});


test('axes have eight evenly spaced time labels and evenly spaced values with peak headroom', () => {
  const html = render({ series: [point(start, 20)] });
  const xLabels = [...html.matchAll(/class="chart-axis-label chart-date-label"[^>]*x="([^"]+)"/g)].map((match) => Number(match[1]));
  assert.equal(xLabels.length, 8);
  for (let index = 1; index < xLabels.length; index++) {
    assert.ok(Math.abs((xLabels[index] - xLabels[index - 1]) - (xLabels[7] - xLabels[0]) / 7) < 1e-8);
  }
  const yLabels = [...html.matchAll(/class="chart-axis-label"[^>]*y="([^"]+)"[^>]*>([^<]+)<\/text>/g)];
  const values = yLabels.map((match) => Number(match[2]));
  assert.equal(values.length, 5);
  assert.ok(values[0] >= 20 * 1.2);
  assert.equal(values.at(-1), 0);
  for (let index = 1; index < values.length; index++) {
    assert.equal(values[index - 1] - values[index], values[0] / 4);
    assert.equal(Number(yLabels[index][1]) - Number(yLabels[index - 1][1]), Number(yLabels[1][1]) - Number(yLabels[0][1]));
  }
});


test('catalog-defined products appear in admin usage charts', () => {
  const html = render({ products: [{ code: 'stt', name: 'Speech to Text' }, { code: 'future', name: 'Future product' }],
    series: [{ date: start, total: 5, stt: 3, future: 2 }] });
  assert.match(html, /data-service="stt"/);
  assert.match(html, /data-service="future"/);
  assert.match(html, /Speech to Text: 3 requests/);
  assert.match(html, /Future product: 2 requests/);
});

test('service status charts plot separate status lines without a combined usage line', () => {
  const { ServiceStatusChart } = exports;
  const html = renderToStaticMarkup(React.createElement(ServiceStatusChart, {
    ...props, serviceName: 'Image Generation', statuses: ['succeeded', 'failed', 'running', 'queued'],
    series: [
      { date: start, total: 15, succeeded: 3, failed: 7, running: 5, queued: 0 },
      { date: '2026-09-25T08:20:00Z', total: 999, succeeded: 999 },
    ],
  }));
  assert.equal((html.match(/class="chart-line"/g) ?? []).length, 3);
  assert.ok(!html.includes('data-service="all"'));
  assert.match(html, /Image Generation generation statuses/);
  assert.match(html, /Succeeded: 3 requests/);
  assert.match(html, /Failed: 7 requests/);
  assert.match(html, /Running: 5 requests/);
  assert.ok(!html.includes('Queued'));
  assert.ok(!html.includes('data-service="queued"'));
  assert.match(html, /stroke:#dc2626/);
  assert.ok(!html.includes('999 requests'));
});

test('status charts with no catalog or intervals have finite geometry', () => {
  const html = renderToStaticMarkup(React.createElement(exports.ServiceStatusChart, {
    ...props, serviceName: 'Idle service', statuses: [], series: [],
  }));
  assert.match(html, /No generation activity in the plotted intervals/);
  assert.ok(!/NaN|Infinity/.test(html));
});


test('status legends exclude activity that exists only in future intervals', () => {
  const html = renderToStaticMarkup(React.createElement(exports.ServiceStatusChart, {
    ...props, serviceName: 'Image', statuses: ['succeeded', 'failed', 'queued'],
    series: [
      { date: start, total: 2, succeeded: 2, failed: 0, queued: 0 },
      { date: '2026-09-25T08:20:00Z', total: 8, succeeded: 0, failed: 8, queued: 0 },
    ],
  }));
  assert.equal((html.match(/class="chart-line"/g) ?? []).length, 1);
  assert.match(html, /Succeeded/);
  assert.ok(!html.includes('Failed'));
  assert.ok(!html.includes('Queued'));
  assert.ok(!html.includes('data-service="failed"'));
});

test('interval details are placed after the plot and initially show the latest available interval', () => {
  const html = render();
  assert.ok(html.indexOf('chart-inspector chart-hover-details') > html.indexOf('</svg>'));
  assert.match(html, /Latest interval/);
  assert.match(html, /2 requests · All services/);
  assert.ok(!html.includes('999 requests'));
});

test('service charts use fewer time labels and keep all available data points', () => {
  const renderStatus = (bucketMinutes) => renderToStaticMarkup(React.createElement(exports.ServiceStatusChart, {
    ...props, bucketMinutes, serviceName: 'Image', statuses: ['succeeded'],
    series: [{ date: start, total: 3, succeeded: 3 }, { date: '2026-09-25T08:10:00Z', total: 2, succeeded: 2 }],
  }));
  for (const [minutes, expectedLabels] of [[10, 4], [60, 4], [360, 3]]) {
    const html = renderStatus(minutes);
    assert.match(html, /viewBox="0 0 520 248"/);
    assert.equal((html.match(/chart-axis-label chart-date-label/g) ?? []).length, expectedLabels);
    assert.equal((html.match(/class="chart-point"/g) ?? []).length, 2);
    assert.match(html, /service-status-card/);
    assert.match(html, /2 requests · All statuses/);
  }
});

test('service success percentage includes pending requests, ignores future buckets, and recalculates from refreshed data', () => {
  const renderStatus = (series) => renderToStaticMarkup(React.createElement(exports.ServiceStatusChart, {
    ...props, serviceName: 'Image', statuses: ['succeeded', 'failed', 'running'], series,
  }));
  const first = renderStatus([
    { date: start, total: 10, succeeded: 3, failed: 2, running: 5 },
    { date: '2026-09-25T08:10:00Z', total: 5, succeeded: 2, failed: 0, running: 3 },
    { date: '2026-09-25T08:20:00Z', total: 100, succeeded: 100 },
  ]);
  assert.match(first, /Success<\/span><strong>33.3%/);
  assert.match(first, /5 succeeded \/ 15 generations/);
  assert.match(first, /Includes pending requests/);
  const refreshed = renderStatus([
    { date: start, total: 10, succeeded: 8, failed: 2, running: 0 },
    { date: '2026-09-25T08:10:00Z', total: 5, succeeded: 4, failed: 0, running: 1 },
  ]);
  assert.match(refreshed, /Success<\/span><strong>80%/);
  assert.match(refreshed, /12 succeeded \/ 15 generations/);
  assert.match(renderStatus([{ date: start, total: 2, failed: 2 }]), /Success<\/span><strong>0%/);
  assert.match(renderStatus([{ date: start, total: 0 }]), /Success<\/span><strong>—/);
});
