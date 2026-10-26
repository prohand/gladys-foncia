// -----------------------------------------------------------------------------
// The MyFoncia client against a fake Okta + GraphQL API: no network.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFonciaClient } from '../src/foncia/client.js';
import { DEFAULT_ENDPOINTS } from '../src/foncia/endpoints.js';
import { ERROR_CODES } from '../src/foncia/errors.js';
import { ACCOUNT } from './helpers/fakeFoncia.js';

const endpoints = { ...DEFAULT_ENDPOINTS, apiUrl: 'https://api.test' };
const NOW = Date.parse('2026-10-26T10:00:00Z');

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const edges = (nodes) => ({ edges: nodes.map((node) => ({ node })) });

// What the fake API answers, per GraphQL operation.
const DATA = {
  getBasicAccounts: () => ({
    accounts: [
      {
        uuid: 'A1',
        number: '0042',
        quality: 'CO_OWNER',
        building: { name: 'Les Lilas', address: { address1: '12 rue des Lilas' } },
      },
    ],
  }),
  getDashboardAccountingBalance: () => ({
    account: {
      accounting: {
        currentBalance: { value: -1250, currency: 'EUR' },
        lines: edges([
          { id: 'L1', dueDate: '2026-11-01', amount: { __typename: 'Debit', value: 45000 } },
        ]),
      },
    },
  }),
  getDocumentCategories: () => ({
    account: {
      documentCategories: [
        { key: 'invoices', documentStats: { count: 3, lastCreatedAt: '2026-09-01T10:00:00Z' } },
        { key: 'insurance', documentStats: { count: 0, lastCreatedAt: null } },
        {
          key: 'provisionCalls',
          documentStats: { count: 8, lastCreatedAt: '2026-10-01T10:00:00Z' },
        },
        {
          key: 'generalAssembly',
          documentStats: { count: 2, lastCreatedAt: '2026-06-01T10:00:00Z' },
        },
        { key: 'contract', documentStats: { count: 1, lastCreatedAt: '2025-01-01T10:00:00Z' } },
        { key: 'deposit', documentStats: { count: 1, lastCreatedAt: '2024-01-01T10:00:00Z' } },
      ],
    },
  }),
  getAccountDocuments: ({ customerPortalCategory }) => ({
    account: {
      documents: edges([
        { id: `D-${customerPortalCategory}`, originalFilename: 'x.pdf', createdAt: '2026-10-01' },
        { id: 'D-shared', originalFilename: 'shared.pdf', category: 'generalAssembly' },
      ]),
    },
  }),
  getTickets: () => ({ tickets: edges([{ id: 'T1', ticketNumber: '9', status: 'OPEN' }]) }),
  getGeneralAssemblies: () => ({
    account: {
      nextGeneralAssembly: { id: 'G1', label: 'AGO', officialMeeting: { date: '2027-03-15' } },
      nextGeneralAssemblies: [{ id: 'G1', label: 'AGO', officialMeeting: { date: '2027-03-15' } }],
    },
  }),
};

/** A fake Okta + MyFoncia GraphQL API, recording every request. */
function fakeServer(options = {}) {
  const state = { requests: [], operations: [], issued: 0, challenge: null, ...options };
  const fetch = async (url, init = {}) => {
    const { origin, pathname, searchParams } = new URL(url);
    state.requests.push({ url, init, pathname });
    if (state.offline) {
      throw new TypeError('fetch failed');
    }
    if (`${origin}${pathname}` === `${endpoints.oktaUrl}/api/v1/authn`) {
      const { username, password } = JSON.parse(init.body);
      if (password !== 'good') {
        return json(401, { errorCode: 'E0000004' });
      }
      return json(200, { status: state.authnStatus ?? 'SUCCESS', sessionToken: `st-${username}` });
    }
    if (pathname === '/oauth2/millenium/v1/authorize') {
      assert.equal(init.redirect, 'manual');
      assert.equal(searchParams.get('client_id'), endpoints.clientId);
      assert.equal(searchParams.get('prompt'), 'none');
      assert.equal(searchParams.get('code_challenge_method'), 'S256');
      state.challenge = searchParams.get('code_challenge');
      const back = new URL(endpoints.redirectUri);
      if (state.authorizeError) {
        back.searchParams.set('error', state.authorizeError);
      } else {
        back.searchParams.set('code', 'code-1');
        back.searchParams.set('state', searchParams.get('state'));
      }
      return new Response(null, { status: 302, headers: { Location: back.toString() } });
    }
    if (pathname === '/oauth2/millenium/v1/token') {
      const form = new URLSearchParams(init.body.toString());
      if (form.get('grant_type') === 'authorization_code') {
        const challenge = createHash('sha256')
          .update(form.get('code_verifier'))
          .digest('base64url');
        assert.equal(challenge, state.challenge, 'PKCE verifier matches the challenge');
      } else if (state.refreshRefused) {
        return json(400, { error: 'invalid_grant' });
      }
      state.issued += 1;
      return json(200, {
        access_token: `at-${state.issued}`,
        refresh_token: `rt-${state.issued}`,
        expires_in: 3600,
      });
    }
    if (url === 'https://api.test/graphql') {
      const { operationName, query, variables } = JSON.parse(init.body);
      assert.match(query, new RegExp(`query ${operationName}\\b`));
      state.operations.push({ operationName, variables });
      if (state.revoked?.includes(init.headers.Authorization)) {
        return json(200, {
          errors: [{ message: 'nope', extensions: { code: 'UNAUTHENTICATED' } }],
        });
      }
      if (state.graphql400) {
        return json(400, { errors: [{ message: state.graphql400 }] });
      }
      if (state.graphqlStatus) {
        return json(state.graphqlStatus, {});
      }
      if (state.failingSpace && variables.customerPortalCategory === state.failingSpace) {
        return json(200, { errors: [{ message: 'not allowed' }], data: null });
      }
      if (state.graphqlError) {
        return json(200, { errors: [{ message: state.graphqlError }], data: null });
      }
      return json(200, { data: DATA[operationName](variables) });
    }
    return json(404, {});
  };
  return { state, fetch };
}

const client = (server, now = () => NOW, password = 'good') =>
  createFonciaClient({ username: 'me@example.com', password, endpoints, fetch: server.fetch, now });

test('signs in like the web app (authn, authorize with PKCE, token), then reads the accounts', async () => {
  const server = fakeServer();
  const accounts = await client(server).getAccounts();
  assert.deepEqual(accounts, [
    {
      id: 'A1',
      number: '0042',
      quality: 'CO_OWNER',
      name: 'Les Lilas',
      address: '12 rue des Lilas',
      role: 'owner',
    },
  ]);
  assert.deepEqual(
    server.state.requests.map((r) => r.pathname),
    ['/api/v1/authn', '/oauth2/millenium/v1/authorize', '/oauth2/millenium/v1/token', '/graphql'],
  );
  assert.equal(server.state.requests.at(-1).init.headers.Authorization, 'Bearer at-1');
});

test('reads the accounting, the documents, the tickets and the general assemblies', async () => {
  const server = fakeServer();
  const foncia = client(server);
  assert.deepEqual(await foncia.getSummary(ACCOUNT), {
    balance: -12.5,
    due: { amount: 450, date: '2026-11-01', label: null },
    lastPayment: null,
  });
  const documents = await foncia.getDocuments(ACCOUNT);
  assert.deepEqual(
    documents.map((d) => [d.id, d.category]),
    [
      ['D-provisionCalls', 'call_for_funds'],
      ['D-shared', 'meeting'],
      ['D-invoices', 'invoice'],
      ['D-generalAssembly', 'meeting'],
      ['D-contract', 'other'],
    ],
    'the 4 most recent non-empty categories, without duplicates; the category listed under when the node has none',
  );
  assert.equal((await foncia.getIncidents(ACCOUNT))[0].status, 'open');
  assert.deepEqual(await foncia.getMeetings(ACCOUNT), [
    { id: 'G1', title: 'AGO', date: '2027-03-15' },
  ]);
  assert.deepEqual(await foncia.getMeetings({ ...ACCOUNT, quality: 'TENANT' }), []);
  const categories = server.state.operations
    .filter((o) => o.operationName === 'getAccountDocuments')
    .map((o) => o.variables.customerPortalCategory);
  assert.deepEqual(categories, ['provisionCalls', 'invoices', 'generalAssembly', 'contract']);
});

test('the token is reused, then renewed with the refresh token', async () => {
  const server = fakeServer();
  let now = NOW;
  const foncia = client(server, () => now);
  await foncia.getAccounts();
  await foncia.getIncidents(ACCOUNT);
  assert.equal(server.state.issued, 1, 'one sign-in for two reads');

  now += 3600 * 1000; // expired
  await foncia.getAccounts();
  const tokenCalls = server.state.requests.filter((r) => r.pathname.endsWith('/v1/token'));
  assert.equal(tokenCalls.length, 2);
  assert.equal(
    new URLSearchParams(tokenCalls[1].init.body.toString()).get('grant_type'),
    'refresh_token',
  );
  assert.equal(
    server.state.requests.filter((r) => r.pathname === '/api/v1/authn').length,
    1,
    'the password is not replayed',
  );
});

test('a refused refresh token falls back to a full sign-in', async () => {
  const server = fakeServer({ refreshRefused: true });
  let now = NOW;
  const foncia = client(server, () => now);
  await foncia.getAccounts();
  now += 3600 * 1000;
  await foncia.getAccounts();
  assert.equal(server.state.requests.filter((r) => r.pathname === '/api/v1/authn').length, 2);
});

test('an UNAUTHENTICATED answer signs in again once', async () => {
  const server = fakeServer({ revoked: ['Bearer at-1'] });
  const accounts = await client(server).getAccounts();
  assert.equal(accounts.length, 1);
  assert.equal(server.state.issued, 2);
});

test('the failures carry a code the user can be told about', async () => {
  const codeOf = (promise) =>
    promise.then(
      () => null,
      (err) => err.code,
    );
  const read = (options, password) =>
    client(fakeServer(options), undefined, password).getAccounts();
  assert.equal(await codeOf(read({}, 'bad')), ERROR_CODES.CREDENTIALS);
  assert.equal(await codeOf(read({ authnStatus: 'MFA_REQUIRED' })), ERROR_CODES.MFA);
  assert.equal(await codeOf(read({ authnStatus: 'LOCKED_OUT' })), ERROR_CODES.LOCKED);
  assert.equal(await codeOf(read({ authorizeError: 'access_denied' })), ERROR_CODES.CREDENTIALS);
  assert.equal(await codeOf(read({ offline: true })), ERROR_CODES.NETWORK);
  assert.equal(await codeOf(read({ graphqlStatus: 429 })), ERROR_CODES.RATE_LIMITED);
  assert.equal(await codeOf(read({ graphqlStatus: 500 })), ERROR_CODES.API);
  assert.equal(await codeOf(read({ graphqlError: 'Cannot query field' })), ERROR_CODES.API);
  assert.equal(
    await codeOf(read({ revoked: ['Bearer at-1', 'Bearer at-2'] })),
    ERROR_CODES.CREDENTIALS,
  );
  const noClientId = createFonciaClient({
    username: 'me@example.com',
    password: 'good',
    endpoints: { ...endpoints, clientId: '' },
    fetch: fakeServer().fetch,
  });
  assert.equal(await codeOf(noClientId.getAccounts()), ERROR_CODES.NOT_CONFIGURED);
});

test('the password and the tokens never reach an error message', async () => {
  const err = await client(fakeServer({ graphqlError: 'boom' }))
    .getAccounts()
    .catch((e) => e);
  assert.match(err.message, /getBasicAccounts: boom/);
  assert.doesNotMatch(err.message, /good|at-1|st-me/);
});

test('a document category that cannot be read does not hide the others', async () => {
  const foncia = client(fakeServer({ failingSpace: 'invoices' }));
  assert.deepEqual(
    (await foncia.getDocuments(ACCOUNT)).map((d) => d.id),
    ['D-provisionCalls', 'D-shared', 'D-generalAssembly', 'D-contract'],
  );
});

test('a refused query reports the reasons of the GraphQL server', async () => {
  const err = await client(fakeServer({ graphql400: 'Value "X" does not exist in enum' }))
    .getAccounts()
    .catch((e) => e);
  assert.equal(err.code, ERROR_CODES.API);
  assert.match(err.message, /getBasicAccounts: HTTP 400 \(Value "X" does not exist in enum\)/);
});
