import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CredentialSession, gpuDraft, matchesGpuWrite, newService, prepareGpuWrite, SERVICE_TYPES, validateGpuDraft,
} from '../lib/compute-registry.ts';

const credentialId = '00000000-0000-4000-8000-000000000001';
function record() {
  return {
    gpu_id: 'gpu-one', name: 'GPU one', host_ref: 'host-1', hardware_uuid: 'GPU-device-1', gpu_model: '4090',
    vram_mib: 24576, desired_state: 'enabled', revision: 4, etag: '"gpu:gpu-one:revision:4"',
    collector: { base_url: 'https://collector.test', server_id: 'host-1', credential_ref: credentialId, status_path: '/v1/status', metrics_path: '/metrics' },
    services: Object.entries(SERVICE_TYPES).map(([type, config], index) => ({
      service_id: `service-${index}`, service_type: type, desired_state: index === 1 ? 'retired' : 'enabled', adapter: config.adapter,
      pool_key: config.pool, model_id: `model-${type}`, model_revision: 'v1', base_url: `https://gpu.test/${type}`,
      health_path: '/health', credential_ref: index === 0 ? credentialId : null, recovery_mode: 'reconcile_only', version: 7,
      gpu: { collector: {} }, gpu_revision: 4,
    })),
    reservation: null,
  };
}

test('editing and adding a service retain every saved service identity and strip response-only fields', async () => {
  const source = record();
  const draft = gpuDraft(source);
  draft.services.push({ ...newService('new-service', 'tts'), model_id: 'new-tts', model_revision: 'v2', pool_key: 'tts:second-model', base_url: 'https://gpu.test/new-tts/' });
  const body = await prepareGpuWrite(draft, async (value) => value.mode === 'existing' ? value.reference : null);
  assert.equal(body.services.length, 6);
  assert.deepEqual(body.services.slice(0, 5).map((service) => service.service_id), source.services.map((service) => service.service_id));
  assert.equal(body.services[1].desired_state, 'retired');
  assert.equal(body.services[5].base_url, 'https://gpu.test/new-tts');
  assert.equal(body.services[5].adapter, 'tts_jobs_v1');
  for (const service of body.services) {
    for (const key of ['version', 'gpu', 'gpu_revision', 'draftId', 'credential']) assert.equal(key in service, false);
  }
  assert.equal('service_id' in body.services[5], false);
  assert.equal(body.collector.credential_ref, credentialId);
});

test('all fields validate before any credential is created', async () => {
  const draft = gpuDraft(record());
  draft.services[4].base_url = 'https://user:password@gpu.test/music';
  let calls = 0;
  await assert.rejects(prepareGpuWrite(draft, async () => { calls++; return credentialId; }), /Service 5/);
  assert.equal(calls, 0);
  draft.services[4].base_url = 'https://gpu.test/music';
  draft.collector.credential.mode = 'none';
  assert.match(validateGpuDraft(draft), /Collector credentials/);
});

test('VRAM rejects fractional, negative and unsafe values', () => {
  for (const vram of ['-1', '0', '1.5', '9007199254740993']) {
    assert.match(validateGpuDraft({ ...gpuDraft(record()), vram }), /VRAM/);
  }
});

test('ambiguous credential creation retries with identical key and reuses the saved reference', async () => {
  const session = new CredentialSession();
  const keys = [];
  const draft = { mode: 'new', reference: '', apiKey: 'fixture-key', authorization: 'Bearer fixture-provider' };
  const create = async (body, key) => {
    assert.deepEqual(body.headers, { 'X-API-Key': draft.apiKey, Authorization: draft.authorization });
    keys.push(key);
    if (keys.length === 1) throw new Error('reply lost');
    return { credential_ref: credentialId };
  };
  await assert.rejects(session.resolve(draft, 'Collector', create), /reply lost/);
  assert.equal(await session.resolve(draft, 'Collector', create), credentialId);
  assert.equal(await session.resolve(draft, 'Collector', create), credentialId);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  await session.resolve({ ...draft, apiKey: 'changed' }, 'Collector', async (_body, key) => {
    assert.notEqual(key, keys[0]); return { credential_ref: 'new-reference' };
  });
});

test('lost PUT confirmation matches server-assigned service IDs but detects concurrent changes', async () => {
  const draft = gpuDraft(record());
  draft.services.push({ ...newService('added', 'tts'), model_id: 'tts-second', model_revision: 'v1', pool_key: 'tts:second', base_url: 'https://gpu.test/second' });
  const body = await prepareGpuWrite(draft, async (value) => value.mode === 'existing' ? value.reference : null);
  const saved = { ...record(), ...body, revision: 5, services: body.services.map((service) => ({ ...service, service_id: service.service_id ?? 'new-server-id', version: 1 })) };
  assert.equal(matchesGpuWrite(saved, body), true);
  assert.equal(matchesGpuWrite({ ...saved, name: 'Changed by another admin' }, body), false);
  assert.equal(matchesGpuWrite({ ...saved, services: [...saved.services, saved.services[0]] }, body), false);
});

test('new GPU body carries only encrypted credential references after credential creation', async () => {
  const draft = gpuDraft();
  Object.assign(draft, { name: 'New GPU', hardware_uuid: '' });
  Object.assign(draft.collector, { base_url: 'https://collector.test', server_id: 'server-id' });
  draft.collector.credential.apiKey = 'collector-plaintext-test';
  Object.assign(draft.services[0], { base_url: 'https://gpu.test', model_id: 'model', model_revision: 'v1' });
  const body = await prepareGpuWrite(draft, async (value) => value.mode === 'new' ? credentialId : null);
  assert.equal(body.hardware_uuid, null);
  assert.equal(body.collector.credential_ref, credentialId);
  assert.equal(JSON.stringify(body).includes('collector-plaintext-test'), false);
  assert.equal('credential' in body.services[0], false);
});
