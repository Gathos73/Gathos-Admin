import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import * as crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const sessionSource = await readFile(new URL('../lib/session-token.ts', import.meta.url), 'utf8');
const sessionCompiled = ts.transpileModule(sessionSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const sessionModule = { exports: {} };
new Function('require', 'module', 'exports', sessionCompiled)(id => {
  assert.equal(id, 'node:crypto'); return crypto;
}, sessionModule, sessionModule.exports);
const { verifySession } = sessionModule.exports;

const source = await readFile(new URL('../lib/server-auth.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function token(payload) {
  const data = JSON.stringify({ ...payload, iat: 100, exp: 200 });
  const signature = createHmac('sha256', 'test-secret').update(data).digest('hex');
  return Buffer.from(JSON.stringify({ data, signature })).toString('base64url');
}

test('signed admin claims cannot bypass current backend authorization', async (t) => {
  const originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'test-secret';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  });
  t.mock.method(Date, 'now', () => 150_000);
  let sessionToken;
  let calls = 0;
  let responseBody = { authenticated: true, isAdmin: true, email: 'admin@example.com' };
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return Response.json(responseBody);
  });
  const dependencies = {
    'server-only': {},
    react: { cache: (fn) => fn },
    'next/headers': {
      cookies: async () => ({
        get: () => sessionToken ? { value: sessionToken } : undefined,
        toString: () => '',
      }),
      headers: async () => ({ get: () => '/' }),
    },
    'next/navigation': { redirect: () => { throw new Error('redirect'); } },
    '@/lib/session-token': { verifySession },
    '@/lib/cookie-names': { cookieName: (name) => `${process.env.COOKIE_PREFIX || ''}${name}` },
  };
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((id) => {
    assert.ok(id in dependencies, id);
    return dependencies[id];
  }, loaded, loaded.exports);

  sessionToken = token({ userId: 'admin', email: 'admin@example.com', is_superuser: true });
  assert.deepEqual(await loaded.exports.getAdminAccess(), {
    status: 'authorized', email: 'admin@example.com',
  });
  assert.equal(calls, 1);

  // Replay the exact signed cookie after logout/suspension.
  responseBody = { authenticated: false, isAdmin: false };
  assert.deepEqual(await loaded.exports.getAdminAccess(), { status: 'unauthenticated' });
  assert.equal(calls, 2);

  sessionToken = token({ userId: 'member', email: 'member@example.com', is_superuser: false });
  responseBody = { authenticated: true, isAdmin: false, email: 'member@example.com' };
  assert.deepEqual(await loaded.exports.getAdminAccess(), {
    status: 'forbidden', email: 'member@example.com',
  });
  assert.equal(calls, 3);

  sessionToken = token({ userId: 'legacy', email: 'legacy@example.com' });
  responseBody = { authenticated: true, isAdmin: true, email: 'legacy@example.com' };
  assert.deepEqual(await loaded.exports.getAdminAccess(), {
    status: 'authorized', email: 'legacy@example.com',
  });
  assert.equal(calls, 4);
});
