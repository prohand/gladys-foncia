// -----------------------------------------------------------------------------
// The sync, against an in-memory MyFoncia and the fake Gladys of the SDK.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { FEATURES, accountIds } from '../src/devices/account.js';
import { ERROR_CODES } from '../src/foncia/errors.js';
import { createStore, emptyAccountMemory } from '../src/foncia/store.js';
import { analyzeAccount, createFonciaService } from '../src/foncia/sync.js';
import { MAX_EVENTS_PER_KIND, TRIGGERS } from '../src/capabilities/triggers.js';
import { ACCOUNT, createFakeClient } from './helpers/fakeFoncia.js';

const TODAY = new Date('2026-10-26T10:00:00Z');
const config = normalizeConfig({ username: 'me@example.com', password: 'x' });

async function setup(overrides) {
  const dir = await mkdtemp(join(tmpdir(), 'foncia-'));
  const path = join(dir, 'state.json');
  const store = createStore(path);
  await store.load();
  const gladys = createFakeGladys();
  const client = createFakeClient(overrides);
  const synced = [];
  const service = createFonciaService({
    gladys,
    store,
    createClient: () => client,
    onSynced: (status) => synced.push(status.connected),
    now: () => TODAY,
  });
  service.configure(config);
  return { gladys, client, store, service, path, synced };
}

const stateOf = (gladys, feature) =>
  gladys.fake.states.findLast(
    (s) => s.device_feature_external_id === accountIds(gladys, ACCOUNT.id).feature(feature),
  )?.state;

test('the first sync publishes the account and its figures, and fires nothing', async () => {
  const { gladys, service, synced } = await setup();
  const status = await service.sync();

  assert.equal(status.connected, true);
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  assert.equal(stateOf(gladys, FEATURES.BALANCE), -120);
  assert.equal(stateOf(gladys, FEATURES.AMOUNT_DUE), 450.5);
  assert.equal(stateOf(gladys, FEATURES.DAYS_UNTIL_DUE), 6);
  assert.equal(stateOf(gladys, FEATURES.OPEN_INCIDENTS), 1);
  assert.equal(stateOf(gladys, FEATURES.UNSEEN_DOCUMENTS), 0);
  assert.deepEqual(gladys.fake.sceneEvents, [], 'a first sync only learns');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.transports.at(-1).transport, 'cloud');
  assert.deepEqual(synced, [true]);
});

test('what appears afterwards fires the scene triggers, once', async () => {
  const { gladys, client, service } = await setup();
  await service.sync();

  client.data.documents.push({
    id: 'D2',
    title: 'Convocation AG',
    category: 'meeting',
    date: '2026-10-20',
  });
  client.data.incidents[0].status = 'in_progress';
  client.data.meetings.push({ id: 'M1', title: 'AG 2027', date: '2027-01-15' });
  await service.sync();

  const keys = gladys.fake.sceneEvents.map((event) => event.key).sort();
  assert.deepEqual(keys, [
    TRIGGERS.INCIDENT_UPDATED,
    TRIGGERS.MEETING_SCHEDULED,
    TRIGGERS.NEW_DOCUMENT,
  ]);
  const incident = gladys.fake.sceneEvents.find((e) => e.key === TRIGGERS.INCIDENT_UPDATED).data;
  assert.equal(incident.status, 'in_progress');
  assert.equal(incident.previous_status, 'open');
  assert.equal(stateOf(gladys, FEATURES.UNSEEN_DOCUMENTS), 1);
  assert.equal(stateOf(gladys, FEATURES.DAYS_UNTIL_MEETING), 81);

  await service.sync();
  assert.equal(gladys.fake.sceneEvents.length, 3, 'nothing new, nothing fired');
});

test('the memory survives a restart: no event fired twice', async () => {
  const first = await setup();
  await first.service.sync();
  first.client.data.documents.push({
    id: 'D2',
    title: 'Relevé',
    category: 'statement',
    date: null,
  });
  await first.service.sync();
  assert.equal(first.gladys.fake.sceneEvents.length, 1);

  const saved = JSON.parse(await readFile(first.path, 'utf8'));
  assert.deepEqual(saved.accounts.A1.unseen, ['D2']);

  const store = createStore(first.path);
  await store.load();
  const gladys = createFakeGladys();
  const service = createFonciaService({
    gladys,
    store,
    createClient: () => first.client,
    now: () => TODAY,
  });
  service.configure(config);
  await service.sync();
  assert.deepEqual(gladys.fake.sceneEvents, []);
  assert.equal(stateOf(gladys, FEATURES.UNSEEN_DOCUMENTS), 1, 'still not seen');
});

test('marking the documents as seen sets the counter back to 0', async () => {
  const { gladys, client, service } = await setup();
  await service.sync();
  client.data.documents.push({ id: 'D2', title: 'Facture', category: 'invoice', date: null });
  await service.sync();
  assert.equal(await service.markDocumentsSeen(), 1);
  assert.equal(stateOf(gladys, FEATURES.UNSEEN_DOCUMENTS), 0);
  assert.equal(await service.markDocumentsSeen('ext:unknown'), 0);
});

test('a failed sync is reported, with the reason, and the badge goes unreachable', async () => {
  const { gladys, client, service, synced } = await setup();
  await service.sync();
  client.fail('accounts', ERROR_CODES.CREDENTIALS);
  const status = await service.sync();
  assert.equal(status.connected, false);
  assert.equal(status.error.code, ERROR_CODES.CREDENTIALS);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /refusé/);
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
  assert.deepEqual(synced, [true, false]);
});

test('one list that cannot be read does not stop the others', async () => {
  const { gladys, client, service } = await setup();
  client.fail('meetings', ERROR_CODES.API, 'HTTP 404');
  const status = await service.sync();
  assert.equal(status.connected, true);
  assert.equal(stateOf(gladys, FEATURES.BALANCE), -120);
});

test('without credentials the sync says so, and calls nobody', async () => {
  const { gladys, client, service } = await setup();
  service.configure(normalizeConfig());
  const status = await service.sync();
  assert.equal(status.error.code, ERROR_CODES.NO_CREDENTIALS);
  assert.deepEqual(client.calls, []);
  assert.match(gladys.fake.connectionStatus.message.en, /e-mail and password/);
  await assert.rejects(service.testConnection(), { code: ERROR_CODES.NO_CREDENTIALS });
});

test('two syncs asked at the same time share one run', async () => {
  const { client, service } = await setup();
  await Promise.all([service.sync(), service.sync()]);
  assert.equal(client.calls.filter((call) => call === 'accounts').length, 1);
});

test('the timer syncs at the configured pace', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { client, service } = await setup();
  await service.start();
  t.mock.timers.tick(config.sync_interval * 60_000);
  await new Promise((resolve) => setImmediate(resolve));
  service.stop();
  assert.equal(client.calls.filter((call) => call === 'accounts').length, 2);
});

// --- analyzeAccount, the pure part -------------------------------------------

const analyze = (input) =>
  analyzeAccount({
    device: 'ext:foncia:account:A1',
    account: ACCOUNT,
    summary: null,
    documents: [],
    incidents: [],
    meetings: [],
    memory: emptyAccountMemory(),
    firstSync: false,
    today: '2026-10-26',
    reminderDays: 7,
    ...input,
  });

test('payment_due fires once per due, inside the reminder window only', () => {
  const memory = emptyAccountMemory();
  const far = analyze({ memory, summary: { due: { amount: 100, date: '2026-12-01' } } });
  assert.deepEqual(far.events, []);

  const near = analyze({ memory, summary: { due: { amount: 100, date: '2026-10-30' } } });
  assert.equal(near.events.length, 1);
  assert.deepEqual(near.events[0].data, {
    device: 'ext:foncia:account:A1',
    account: ACCOUNT.name,
    amount: 100,
    due_date: '2026-10-30',
    days_left: 4,
  });

  const again = analyze({ memory, summary: { due: { amount: 100, date: '2026-10-30' } } });
  assert.deepEqual(again.events, []);

  const nothingToPay = analyze({ summary: { due: { amount: 0, date: '2026-10-27' } } });
  assert.deepEqual(nothingToPay.events, []);
});

test('an incident born closed fires nothing, a reopened one does', () => {
  const memory = emptyAccountMemory();
  assert.deepEqual(
    analyze({ memory, incidents: [{ id: 'I9', title: 't', status: 'closed' }] }).events,
    [],
  );
  const reopened = analyze({ memory, incidents: [{ id: 'I9', title: 't', status: 'open' }] });
  assert.equal(reopened.events[0].data.previous_status, 'closed');
  assert.equal(reopened.snapshot.openIncidents, 1);
});

test('a flood of documents fires a bounded number of events, but counts them all', () => {
  const documents = Array.from({ length: 12 }, (_, i) => ({
    id: `D${i}`,
    title: `Doc ${i}`,
    category: 'other',
    date: null,
  }));
  const { events, snapshot } = analyze({ documents });
  assert.equal(events.length, MAX_EVENTS_PER_KIND);
  assert.equal(snapshot.unseenDocuments, 12);
});

test('a list that could not be read leaves its figures unknown', () => {
  const { snapshot } = analyze({ documents: null, incidents: null, meetings: null });
  assert.equal(snapshot.unseenDocuments, null);
  assert.equal(snapshot.openIncidents, null);
  assert.equal(snapshot.balance, null, 'no accounting read, no balance');
});

test('accounting read with nothing due: 0 to pay; accounting unreadable: unknown', () => {
  assert.equal(analyze({ summary: { balance: 0, due: null } }).snapshot.amountDue, 0);
  assert.equal(analyze({ summary: null }).snapshot.amountDue, null);
});
