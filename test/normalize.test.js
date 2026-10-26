import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_CATEGORIES,
  INCIDENT_STATUSES,
  ROLES,
  daysBetween,
  listOf,
  normalizeAccount,
  normalizeDocument,
  normalizeIncident,
  normalizeList,
  normalizeMeeting,
  normalizeSummary,
  toAmount,
  toDate,
} from '../src/foncia/normalize.js';

test('amounts are read the French way too', () => {
  assert.equal(toAmount(12.345), 12.35);
  assert.equal(toAmount('-1 234,56 €'), -1234.56);
  assert.equal(toAmount('1.234,5'), 1234.5);
  assert.equal(toAmount('1234.5'), 1234.5);
  assert.equal(toAmount('1 234,00 EUR'), 1234);
  assert.equal(toAmount('− 10,00'), -10);
  assert.equal(toAmount({ amount: '45,10', currency: 'EUR' }), 45.1);
  assert.equal(toAmount('n/a'), null);
  assert.equal(toAmount(''), null);
  assert.equal(toAmount(null), null);
});

test('dates become YYYY-MM-DD', () => {
  assert.equal(toDate('2026-10-01T08:00:00Z'), '2026-10-01');
  assert.equal(toDate('5/3/2026'), '2026-03-05');
  assert.equal(toDate(Date.UTC(2026, 0, 2)), '2026-01-02');
  assert.equal(toDate('not a date'), null);
  assert.equal(daysBetween('2026-10-26', '2026-11-01'), 6);
  assert.equal(daysBetween('2026-10-26', '2026-10-20'), -6);
  assert.equal(daysBetween('2026-10-26', null), null);
});

test('lists are found under the usual wrappers', () => {
  assert.deepEqual(listOf([1]), [1]);
  assert.deepEqual(listOf({ items: [1] }), [1]);
  assert.deepEqual(listOf({ data: { results: [2] } }), [2]);
  assert.deepEqual(listOf({ comptes: [3] }, 'comptes'), [3]);
  assert.deepEqual(listOf('nope'), []);
});

test('accounts: id, name, role and balance under their known names', () => {
  assert.deepEqual(
    normalizeAccount({ uuid: 7, libelle: 'Lot 12', typeCompte: 'Copropriétaire', solde: '-50,00' }),
    { id: '7', name: 'Lot 12', address: null, role: ROLES.OWNER, balance: -50 },
  );
  const tenant = normalizeAccount({
    id: 'X',
    address: { label: '1 rue Haute' },
    role: 'LOCATAIRE',
  });
  assert.equal(tenant.name, '1 rue Haute');
  assert.equal(tenant.role, ROLES.TENANT);
  assert.equal(normalizeAccount({ name: 'no id' }), null);
  assert.equal(normalizeAccount(null), null);
});

test('summary: balance, next due and next meeting', () => {
  assert.deepEqual(
    normalizeSummary({
      solde: 10,
      prochainAppel: { montant: '450,50', dateEcheance: '01/11/2026' },
      nextMeeting: { date: '2027-03-15' },
    }),
    { balance: 10, due: { amount: 450.5, date: '2026-11-01' }, nextMeetingDate: '2027-03-15' },
  );
  assert.deepEqual(normalizeSummary(null), { balance: null, due: null, nextMeetingDate: null });
});

test('documents are sorted into the trigger categories', () => {
  const category = (title, type) => normalizeDocument({ id: 1, title, type }).category;
  assert.equal(category('Appel de fonds 4T 2026'), DOCUMENT_CATEGORIES.CALL_FOR_FUNDS);
  assert.equal(category('Convocation AG 2027'), DOCUMENT_CATEGORIES.MEETING);
  assert.equal(category('Procès-verbal'), DOCUMENT_CATEGORIES.MEETING);
  assert.equal(category('Décompte de charges 2025'), DOCUMENT_CATEGORIES.STATEMENT);
  assert.equal(category('Quittance octobre'), DOCUMENT_CATEGORIES.INVOICE);
  assert.equal(category('Règlement intérieur'), DOCUMENT_CATEGORIES.OTHER);
  assert.equal(category('Doc', 'INVOICE'), DOCUMENT_CATEGORIES.INVOICE);
});

test('incidents get one of three statuses', () => {
  const status = (statut) => normalizeIncident({ id: 1, statut }).status;
  assert.equal(status('Nouveau'), INCIDENT_STATUSES.OPEN);
  assert.equal(status('En cours'), INCIDENT_STATUSES.IN_PROGRESS);
  assert.equal(status('Intervention planifiée'), INCIDENT_STATUSES.IN_PROGRESS);
  assert.equal(status('Clôturé'), INCIDENT_STATUSES.CLOSED);
  assert.equal(status('RESOLVED'), INCIDENT_STATUSES.CLOSED);
});

test('meetings without an id are known by their date', () => {
  assert.deepEqual(normalizeMeeting({ dateAG: '2027-03-15' }), {
    id: '2027-03-15',
    title: 'General assembly',
    date: '2027-03-15',
  });
  assert.equal(normalizeMeeting({ title: 'no date, no id' }), null);
});

test('normalizeList drops what it cannot identify', () => {
  assert.deepEqual(
    normalizeList(
      { items: [{ id: 1, title: 'A' }, { title: 'no id' }, null] },
      normalizeDocument,
    ).map((d) => d.id),
    ['1'],
  );
});
