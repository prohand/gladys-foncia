// -----------------------------------------------------------------------------
// Scene actions, scene triggers and the dashboard widget, against the
// manifest that declares them.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { buildAccountDevice } from '../src/devices/account.js';
import { ERROR_CODES } from '../src/foncia/errors.js';
import { createStore } from '../src/foncia/store.js';
import { createFonciaService } from '../src/foncia/sync.js';
import { SCENE_ACTIONS } from '../src/capabilities/scenes.js';
import {
  incidentUpdatedEvent,
  meetingScheduledEvent,
  newDocumentEvent,
  paymentDueEvent,
  TRIGGERS,
} from '../src/capabilities/triggers.js';
import { ACCOUNT_WIDGET, WIDGETS, refreshWidgets } from '../src/capabilities/widget.js';
import { ACCOUNT, createFakeClient } from './helpers/fakeFoncia.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

async function setup() {
  const store = createStore(join(await mkdtemp(join(tmpdir(), 'foncia-')), 'state.json'));
  await store.load();
  const gladys = createFakeGladys();
  const client = createFakeClient();
  const service = createFonciaService({
    gladys,
    store,
    createClient: () => client,
    now: () => new Date('2026-10-26T10:00:00Z'),
  });
  service.configure(normalizeConfig({ username: 'me@example.com', password: 'x' }));
  return { gladys, client, service };
}

test('every trigger event only carries keys its declaration keeps', () => {
  const device = 'ext:foncia:account:A1';
  const events = [
    newDocumentEvent(device, ACCOUNT, { title: 't', category: 'other', date: null }),
    incidentUpdatedEvent(device, ACCOUNT, { title: 't', status: 'open' }, undefined),
    paymentDueEvent(device, ACCOUNT, { amount: 1, date: '2026-11-01' }, 6),
    meetingScheduledEvent(device, ACCOUNT, { title: 't', date: '2027-01-01' }, 67),
  ];
  assert.deepEqual(events.map((e) => e.key).sort(), keysOf(manifest.scene_triggers).sort());
  assert.deepEqual(Object.values(TRIGGERS).sort(), keysOf(manifest.scene_triggers).sort());
  for (const { key, data } of events) {
    const trigger = declarationOf('scene_triggers', key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}: data.${name} is not declared`);
      assert.ok(value === null || typeof value !== 'object', `${key}: data.${name} not flat`);
    }
  }
});

test('the select filters of the triggers list every value the code can send', () => {
  const optionsOf = (key, field) =>
    declarationOf('scene_triggers', key)
      .fields.find((f) => f.key === field)
      .options.map((o) => o.value)
      .sort();
  assert.deepEqual(optionsOf(TRIGGERS.NEW_DOCUMENT, 'category'), [
    'call_for_funds',
    'invoice',
    'meeting',
    'other',
    'statement',
  ]);
  assert.deepEqual(optionsOf(TRIGGERS.INCIDENT_UPDATED, 'status'), [
    'closed',
    'in_progress',
    'open',
  ]);
});

test('sync_now returns the declared outputs of the chosen account', async () => {
  const { gladys, service } = await setup();
  const device = buildAccountDevice(gladys, ACCOUNT).external_id;
  const outputs = await SCENE_ACTIONS.sync_now(service, { fields: { device } });
  assert.deepEqual(outputs, {
    success: true,
    account: ACCOUNT.name,
    balance: -120,
    amount_due: 450.5,
    due_date: '2026-11-01',
    open_incidents: 1,
    new_documents: 0,
  });
  const declared = keysOf(declarationOf('scene_actions', 'sync_now').outputs);
  assert.deepEqual(Object.keys(outputs).sort(), [...declared].sort());
});

test('a failed sync_now is an output, not an exception', async () => {
  const { client, service } = await setup();
  client.fail('accounts', ERROR_CODES.NETWORK);
  const outputs = await SCENE_ACTIONS.sync_now(service, { fields: {} });
  assert.equal(outputs.success, false);
  assert.equal(outputs.balance, null);
});

test('mark_documents_seen returns the declared output', async () => {
  const { service } = await setup();
  await service.sync();
  const outputs = await SCENE_ACTIONS.mark_documents_seen(service, { fields: {} });
  assert.deepEqual(outputs, { cleared: 0 });
  assert.deepEqual(keysOf(declarationOf('scene_actions', 'mark_documents_seen').outputs), [
    'cleared',
  ]);
});

const widget = WIDGETS[ACCOUNT_WIDGET];
const getContent = (gladys, service, settings = {}) =>
  widget.get(gladys, { settings, language: 'fr', units: 'metric', service });

test('the widget content is rendered exactly as sent, before and after a sync', async () => {
  const { gladys, service, client } = await setup();
  assert.deepEqual(validateWidgetContent(await getContent(gladys, service)), []);
  await service.sync();
  const content = await getContent(gladys, service);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(content.components.some((c) => c.type === 'card-list'));

  client.data.documents = [];
  client.fail('accounts', ERROR_CODES.MFA);
  await service.sync();
  assert.deepEqual(validateWidgetContent(await getContent(gladys, service)), []);
});

test('the tiles always show a value: 0 when nothing is due, a dash when unreadable', async () => {
  const { gladys, client, service } = await setup();
  client.data.summary = { balance: 0, due: null, lastPayment: { amount: 300, date: '2026-10-05' } };
  await service.sync();
  const tiles = (await getContent(gladys, service)).components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((t) => [t.label.en, t.value]),
    [
      ['Balance', 0],
      ['Amount due', 0],
      ['Last payment', 300],
      ['New documents', 0],
    ],
  );

  client.fail('documents', ERROR_CODES.API);
  client.fail('summary', ERROR_CODES.API);
  await service.sync();
  const content = await getContent(gladys, service);
  assert.deepEqual(validateWidgetContent(content), []);
  const values = content.components.filter((c) => c.type === 'value').map((t) => t.value);
  assert.deepEqual(values, ['—', '—', '—', '—']);
  assert.match(content.components.find((c) => c.type === 'text').text.en, /unreadable/);
});

test('every widget button is handled and answers a short toast in every language', async () => {
  const { gladys, service } = await setup();
  await service.sync();
  const buttons = (await getContent(gladys, service)).components.filter(
    (c) => c.type === 'button' && c.action,
  );
  assert.equal(buttons.length, 2);
  for (const { action } of buttons) {
    const message = await widget.action(gladys, {
      actionKey: action.key,
      params: action.params ?? {},
      settings: {},
      service,
    });
    for (const language of ['en', 'fr', 'de', 'es']) {
      assert.ok(message[language] && message[language].length <= 200, `${action.key}.${language}`);
    }
  }
  await assert.rejects(
    widget.action(gladys, { actionKey: 'nope', params: {}, settings: {}, service }),
    /Unknown widget action/,
  );
});

test('refreshWidgets nudges every declared widget', () => {
  const gladys = createFakeGladys();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.fake.widgetRefreshes, keysOf(manifest.widgets));
});
