import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { FEATURES, accountStates, buildAccountDevice } from '../src/devices/account.js';
import { ACCOUNT } from './helpers/fakeFoncia.js';

test('Gladys accepts the account device', async () => {
  // The SDK fake checks the payload like the host API: external id prefix,
  // known category / type / unit. A refusal is a 400 for the WHOLE list.
  const gladys = createFakeGladys();
  await gladys.publishDiscoveredDevices([buildAccountDevice(gladys, ACCOUNT)]);
  assert.equal(gladys.fake.discoveredDevices.length, 1);
});

test('one feature per figure, read-only, with min and max, never polled', () => {
  const gladys = createFakeGladys();
  const device = buildAccountDevice(gladys, ACCOUNT);
  assert.equal(device.name, `Foncia – ${ACCOUNT.name}`);
  assert.equal(device.poll_frequency, undefined, 'MyFoncia values are pushed by the sync');
  assert.deepEqual(
    device.features.map((feature) => feature.external_id.split(':').at(-1)),
    Object.values(FEATURES),
  );
  for (const feature of device.features) {
    assert.equal(feature.read_only, true);
    assert.ok(Number.isFinite(feature.min) && Number.isFinite(feature.max));
    assert.ok(!('unit' in feature) || typeof feature.unit === 'string');
  }
});

test('unknown figures are not published, known ones are accepted by Gladys', async () => {
  const gladys = createFakeGladys();
  const states = accountStates(gladys, {
    account: ACCOUNT,
    balance: -10,
    due: null,
    daysUntilDue: null,
    openIncidents: 0,
    unseenDocuments: null,
    daysUntilMeeting: null,
  });
  assert.equal(states.length, 2);
  await gladys.publishStates(states);
  assert.equal(gladys.fake.states.length, 2);
});
