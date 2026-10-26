// -----------------------------------------------------------------------------
// The MyFoncia client against a fake Okta + API: no network.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFonciaClient } from '../src/foncia/client.js';
import { DEFAULT_ENDPOINTS } from '../src/foncia/endpoints.js';
import { ERROR_CODES } from '../src/foncia/errors.js';

const endpoints = { ...DEFAULT_ENDPOINTS, clientId: 'client-1', apiUrl: 'https://api.test' };

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A fake Okta + MyFoncia API, recording every request. */
function fakeServer(options = {}) {
  const state = { requests: [], issued: 0, challenge: null, refreshRefused: false, ...options };
  const fetch = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url);
    state.requests.push({ url, init, pathname });
    if (state.offline) {
      throw new TypeError('fetch failed');
    }
    if (pathname === '/api/v1/authn') {
      const { username, password } = JSON.parse(init.body);
      if (password !== 'good') {
        return json(401, { errorCode: 'E0000004' });
      }
      return json(200, { status: state.authnStatus ?? 'SUCCESS', sessionToken: `st-${username}` });
    }
    if (pathname === '/oauth2/v1/authorize') {
      assert.equal(init.redirect, 'manual');
      assert.equal(searchParams.get('client_id'), 'client-1');
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
    if (pathname === '/oauth2/v1/token') {
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
    if (pathname === '/accounts') {
      const token = init.headers.Authorization;
      if (state.revoked?.includes(token)) {
        return json(401, {});
      }
      return state.accountsStatus
        ? json(state.accountsStatus, {})
        : json(200, { items: [{ id: 'A1', label: 'Lot 1', solde: '-12,50' }] });
    }
    if (pathname === '/accounts/A1/documents') {
      return json(200, [{ id: 'D1', title: 'Appel de fonds' }]);
    }
    return json(404, {});
  };
  return { state, fetch };
}

const client = (server, now = () => 0, password = 'good') =>
  createFonciaClient({ username: 'me@example.com', password, endpoints, fetch: server.fetch, now });

test('signs in through Okta with PKCE, then reads the accounts', async () => {
  const server = fakeServer();
  const accounts = await client(server).getAccounts();
  assert.deepEqual(accounts, [
    { id: 'A1', name: 'Lot 1', address: null, role: 'unknown', balance: -12.5 },
  ]);
  assert.deepEqual(
    server.state.requests.map((r) => r.pathname),
    ['/api/v1/authn', '/oauth2/v1/authorize', '/oauth2/v1/token', '/accounts'],
  );
  assert.equal(server.state.requests.at(-1).init.headers.Authorization, 'Bearer at-1');
});

test('the token is reused, then renewed with the refresh token', async () => {
  const server = fakeServer();
  let now = 0;
  const foncia = client(server, () => now);
  await foncia.getAccounts();
  await foncia.getDocuments('A1');
  assert.equal(server.state.issued, 1, 'one sign-in for two reads');

  now = 3600 * 1000; // expired
  await foncia.getAccounts();
  const tokenCalls = server.state.requests.filter((r) => r.pathname === '/oauth2/v1/token');
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
  let now = 0;
  const foncia = client(server, () => now);
  await foncia.getAccounts();
  now = 3600 * 1000;
  await foncia.getAccounts();
  assert.equal(server.state.requests.filter((r) => r.pathname === '/api/v1/authn').length, 2);
});

test('a 401 from the API signs in again once', async () => {
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
  assert.equal(
    await codeOf(client(fakeServer(), undefined, 'bad').getAccounts()),
    ERROR_CODES.CREDENTIALS,
  );
  assert.equal(
    await codeOf(client(fakeServer({ authnStatus: 'MFA_REQUIRED' })).getAccounts()),
    ERROR_CODES.MFA,
  );
  assert.equal(
    await codeOf(client(fakeServer({ authnStatus: 'LOCKED_OUT' })).getAccounts()),
    ERROR_CODES.LOCKED,
  );
  assert.equal(
    await codeOf(client(fakeServer({ authorizeError: 'access_denied' })).getAccounts()),
    ERROR_CODES.CREDENTIALS,
  );
  assert.equal(
    await codeOf(client(fakeServer({ offline: true })).getAccounts()),
    ERROR_CODES.NETWORK,
  );
  assert.equal(
    await codeOf(client(fakeServer({ accountsStatus: 429 })).getAccounts()),
    ERROR_CODES.RATE_LIMITED,
  );
  assert.equal(
    await codeOf(client(fakeServer({ accountsStatus: 500 })).getAccounts()),
    ERROR_CODES.API,
  );
  const noClientId = createFonciaClient({
    username: 'me@example.com',
    password: 'good',
    endpoints: DEFAULT_ENDPOINTS,
    fetch: fakeServer().fetch,
  });
  assert.equal(await codeOf(noClientId.getAccounts()), ERROR_CODES.NOT_CONFIGURED);
});

test('the password and the tokens never reach an error message', async () => {
  const server = fakeServer({ accountsStatus: 500 });
  const err = await client(server)
    .getAccounts()
    .catch((e) => e);
  assert.doesNotMatch(err.message, /good|at-1|st-me/);
});
