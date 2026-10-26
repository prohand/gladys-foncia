// -----------------------------------------------------------------------------
// MyFoncia GraphQL answers -> the shapes the integration works with. The
// samples follow the fields of the web app's own queries (src/foncia/queries.js).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_CATEGORIES,
  INCIDENT_STATUSES,
  ROLES,
  daysBetween,
  nodesOf,
  normalizeAccount,
  normalizeAccounting,
  normalizeDocument,
  normalizeList,
  normalizeMeeting,
  normalizeTicket,
  fromAmount,
  toAmount,
  toDate,
} from '../src/foncia/normalize.js';

test('amounts are read as numbers, French strings or { value } objects', () => {
  assert.equal(toAmount(12.345), 12.35);
  assert.equal(toAmount('-1 234,56 €'), -1234.56);
  assert.equal(toAmount('1.234,5'), 1234.5);
  assert.equal(toAmount('1 234,00 EUR'), 1234);
  assert.equal(toAmount({ value: 4510, currency: 'EUR' }), 45.1, 'an Amount is in cents');
  assert.equal(toAmount('n/a'), null);
  assert.equal(toAmount(null), null);
});

test('MyFoncia amounts are cents, as the web app reads them', () => {
  assert.equal(fromAmount({ value: 62282, currency: 'EUR' }), 622.82);
  assert.equal(fromAmount({ value: -4505, currency: 'EUR' }), -45.05);
  assert.equal(fromAmount({ value: 0, currency: 'EUR' }), 0);
  assert.equal(fromAmount({ value: 12.5 }), null, 'not an integer: not an amount the app shows');
  assert.equal(fromAmount(null), null);
});

test('dates become YYYY-MM-DD', () => {
  assert.equal(toDate('2026-10-01T08:00:00Z'), '2026-10-01');
  assert.equal(toDate('5/3/2026'), '2026-03-05');
  assert.equal(toDate('not a date'), null);
  assert.equal(daysBetween('2026-10-26', '2026-11-01'), 6);
  assert.equal(daysBetween('2026-10-26', '2026-10-20'), -6);
  assert.equal(daysBetween('2026-10-26', null), null);
});

test('connections give their nodes', () => {
  assert.deepEqual(nodesOf({ edges: [{ node: 1 }, { node: null }, {}] }), [1]);
  assert.deepEqual(nodesOf([2]), [2]);
  assert.deepEqual(nodesOf(null), []);
});

test('accounts: uuid, building name, role from the quality', () => {
  const building = {
    id: 'B1',
    name: 'Résidence Les Lilas',
    address: { address1: '12 rue des Lilas', zipCode: '75011', city: 'Paris' },
  };
  assert.deepEqual(
    normalizeAccount({ uuid: 'QWNjb3VudDox', number: '0042', quality: 'CO_OWNER', building }),
    {
      id: 'QWNjb3VudDox',
      number: '0042',
      quality: 'CO_OWNER',
      name: 'Résidence Les Lilas',
      address: '12 rue des Lilas 75011 Paris',
      role: ROLES.OWNER,
    },
  );
  const tenant = normalizeAccount({
    uuid: 'T',
    quality: 'TENANT',
    building: { ...building, name: null },
  });
  assert.equal(tenant.name, '12 rue des Lilas 75011 Paris');
  assert.equal(tenant.role, ROLES.TENANT);
  const landlord = normalizeAccount({ uuid: 'L', number: '7', quality: 'LANDLORD', buildings: [] });
  assert.equal(landlord.name, 'Foncia 7');
  assert.equal(landlord.role, ROLES.OWNER);
  assert.equal(normalizeAccount({ number: 'no uuid' }), null);
});

test('accounting: balance, and the earliest debit still to come as the next due', () => {
  const line = (id, typename, value, dueDate) => ({
    node: { id, label: `L${id}`, dueDate, amount: { __typename: typename, value } },
  });
  const accounting = {
    currentBalance: { value: -45050, currency: 'EUR' }, // cents
    lines: {
      edges: [
        line(1, 'Debit', 45050, '2026-10-01'), // past
        line(2, 'Credit', 30000, '2026-10-05'), // a payment, not a due
        line(5, 'Credit', 12000, '2026-09-05'), // an older payment
        line(3, 'Debit', 47000, '2027-01-01'),
        line(4, 'Debit', 46000, '2026-11-01'),
      ],
    },
  };
  assert.deepEqual(normalizeAccounting(accounting, '2026-10-26'), {
    balance: -450.5,
    due: { amount: 460, date: '2026-11-01', label: 'L4' },
    lastPayment: { amount: 300, date: '2026-10-05' },
  });
  assert.deepEqual(normalizeAccounting(null, '2026-10-26'), {
    balance: null,
    due: null,
    lastPayment: null,
  });
});

test('documents are sorted into the trigger categories', () => {
  const category = (value) => normalizeDocument({ id: 'D', category: value }).category;
  assert.equal(category('provisionCalls'), DOCUMENT_CATEGORIES.CALL_FOR_FUNDS);
  assert.equal(category('dueNotice'), DOCUMENT_CATEGORIES.CALL_FOR_FUNDS);
  assert.equal(category('generalAssembly'), DOCUMENT_CATEGORIES.MEETING);
  assert.equal(category('accountSituation'), DOCUMENT_CATEGORIES.STATEMENT);
  assert.equal(category('invoices'), DOCUMENT_CATEGORIES.INVOICE);
  assert.equal(category('insurance'), DOCUMENT_CATEGORIES.OTHER);
  assert.deepEqual(
    normalizeDocument({
      id: 'D1',
      originalFilename: 'Appel de fonds T4.pdf',
      category: 'provisionCalls',
      createdAt: '2026-10-01T09:00:00Z',
    }),
    { id: 'D1', title: 'Appel de fonds T4', category: 'call_for_funds', date: '2026-10-01' },
  );
});

test('tickets get one of three statuses and a readable title', () => {
  const status = (value) => normalizeTicket({ id: 'T', status: value }).status;
  assert.equal(status('OPEN'), INCIDENT_STATUSES.OPEN);
  assert.equal(status('WAITING_FOR_FIRST_CLIENT_RESPONSE'), INCIDENT_STATUSES.OPEN);
  assert.equal(status('WORK_IN_PROGRESS'), INCIDENT_STATUSES.IN_PROGRESS);
  assert.equal(status('PROCESSED'), INCIDENT_STATUSES.CLOSED, 'shown as "Traitée"');
  assert.equal(status('closed'), INCIDENT_STATUSES.CLOSED);
  assert.equal(status('AUTO_CLOSED_NO_CLIENT_RESPONSE'), INCIDENT_STATUSES.CLOSED);
  assert.equal(status('FINISHED'), INCIDENT_STATUSES.CLOSED);
  assert.equal(status('CLOSED'), INCIDENT_STATUSES.CLOSED);
  const ended = (fields) => normalizeTicket({ id: 'T', status: 'OPEN', ...fields }).status;
  assert.equal(ended({ finishedAt: '2026-10-01' }), INCIDENT_STATUSES.CLOSED);
  assert.equal(ended({ cancelledAt: '2026-10-01' }), INCIDENT_STATUSES.CLOSED);
  assert.equal(
    normalizeTicket({ id: 'T', ticketNumber: '123', category: 'CO_OWNER_REPAIR_SINISTER' }).title,
    '#123 repair sinister',
  );
});

test('general assemblies are known by their id, dated by the official meeting', () => {
  assert.deepEqual(
    normalizeMeeting({ id: 'G1', label: 'AGO 2027', officialMeeting: { date: '2027-03-15' } }),
    { id: 'G1', title: 'AGO 2027', date: '2027-03-15' },
  );
  assert.equal(normalizeMeeting({ label: 'no id' }), null);
});

test('normalizeList drops what it cannot identify', () => {
  assert.deepEqual(
    normalizeList(
      { edges: [{ node: { id: 1 } }, { node: { title: 'no id' } }] },
      normalizeDocument,
    ).map((d) => d.id),
    ['1'],
  );
});
