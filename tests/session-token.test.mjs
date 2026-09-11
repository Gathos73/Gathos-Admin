import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { verifySession } from '../lib/session-token.ts';

const secret = 'test-only-secret';
const payload = { userId: 'user-1', email: 'test@example.com', iat: 100, exp: 200 };
function token(value, key = secret) {
  // Preserve whitespace: FastAPI signs the raw JSON string, not reserialized JSON.
  const data = JSON.stringify(value, null, 2);
  return Buffer.from(JSON.stringify({ data, signature: createHmac('sha256', key).update(data).digest('hex') })).toString('base64url');
}
test('accepts a signed Python-compatible envelope and checks expiration', () => {
  assert.deepEqual(verifySession(token(payload), secret, 150), payload);
  assert.equal(verifySession(token(payload), secret, 200), null);
  assert.equal(verifySession(token(payload), 'different-secret', 150), null);
  assert.equal(verifySession(token(payload), '', 150), null);
});
test('rejects tampering, malformed envelopes, and invalid claims', () => {
  const envelope = JSON.parse(Buffer.from(token(payload), 'base64url').toString());
  envelope.data = envelope.data.replace('user-1', 'user-2');
  assert.equal(verifySession(Buffer.from(JSON.stringify(envelope)).toString('base64url'), secret, 150), null);
  for (const value of [null, [], {}, { ...payload, exp: true }, { ...payload, exp: 100 }, { ...payload, iat: null }, { ...payload, userId: '' }]) {
    assert.equal(verifySession(token(value), secret, 150), null);
  }
  for (const value of ['', 'invalid', 'a'.repeat(17000)]) assert.equal(verifySession(value, secret, 150), null);
});
