// -----------------------------------------------------------------------------
// A MyFoncia that lives in memory: the client the sync talks to in the tests.
// Each list can be replaced, or made to fail, between two syncs.
// -----------------------------------------------------------------------------

import { FonciaError } from '../../src/foncia/errors.js';

export const ACCOUNT = {
  id: 'A1',
  name: '12 rue des Lilas',
  address: null,
  role: 'owner',
  balance: -120,
};

export function createFakeClient(overrides = {}) {
  const data = {
    accounts: [ACCOUNT],
    summary: { balance: -120, due: { amount: 450.5, date: '2026-11-01' }, nextMeetingDate: null },
    documents: [
      { id: 'D1', title: 'Appel de fonds T4', category: 'call_for_funds', date: '2026-10-01' },
    ],
    incidents: [{ id: 'I1', title: 'Fuite parking', status: 'open', date: '2026-10-10' }],
    meetings: [],
    ...overrides,
  };
  const calls = [];
  const failures = {};
  const answer = (name) => {
    calls.push(name);
    if (failures[name]) {
      return Promise.reject(failures[name]);
    }
    return Promise.resolve(structuredClone(data[name]));
  };
  return {
    data,
    calls,
    fail(name, code, message = 'boom') {
      failures[name] = new FonciaError(code, message);
    },
    heal(name) {
      delete failures[name];
    },
    signIn: () => answer('signIn').catch((err) => Promise.reject(err)),
    signOut() {},
    getAccounts: () => answer('accounts'),
    getSummary: () => answer('summary'),
    getDocuments: () => answer('documents'),
    getIncidents: () => answer('incidents'),
    getMeetings: () => answer('meetings'),
  };
}
