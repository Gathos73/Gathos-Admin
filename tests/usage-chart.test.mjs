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
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
});
const exports = {};
vm.runInNewContext(outputText, { exports, require: createRequire(import.meta.url), Intl, Date });
const { UsageChart, UsageWindow } = exports;
const start = '2026-09-25T08:00:00Z';
const end = '2026-09-25T12:00:00Z';
const point = (date, total) => ({ date, total, image: total, image2image: 0, tts: 0, video: 0 });
const props = {
  series: [point(start, 3), point('2026-09-25T08:10:00Z', 2), point('2026-09-25T08:20:00Z', 999)],
  service: 'all', bucketMinutes: 10, sampledAt: '2026-09-25T08:15:00Z', periodStart: start, periodEnd: end,
};
const render = (overrides = {}) => renderToStaticMarkup(React.createElement(UsageChart, { ...props, ...overrides }));

test('future buckets are not plotted or included in the peak while the full window axis remains', () => {
  const html = render();
  assert.match(html, /Peak interval: 3 requests/);
  assert.equal((html.match(/class="chart-point"/g) ?? []).length, 2);
  // Ten minutes into a four-hour window: x = 38 + (10 / 240) * 728.
  assert.match(html, /L68\.33 /);
  const localEnd = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(end));
  assert.ok(html.includes(localEnd));
  assert.ok(!html.includes('999 requests'));
});

test('individual services use their own values, including services with zero usage', () => {
  assert.match(render({ service: 'image' }), /Text to image request volume. Peak interval: 3/);
  for (const service of ['image2image', 'tts', 'video']) {
    assert.match(render({ service }), /Peak interval: 0 requests/);
  }
});

test('empty and newly opened windows produce finite geometry', () => {
  assert.match(render({ series: [] }), /No intervals available yet/);
  const html = render({ sampledAt: start });
  assert.equal((html.match(/class="chart-point"/g) ?? []).length, 1);
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
