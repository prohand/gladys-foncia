// -----------------------------------------------------------------------------
// MyFoncia client: sign in, keep the token fresh, read the account.
//
// Sign-in is the standard Okta flow a single-page app runs, done without a
// browser:
//   1. POST /api/v1/authn with the e-mail and password -> a one-time
//      `sessionToken` (or a status saying why not: MFA, locked account…);
//   2. GET /oauth2/millenium/v1/authorize with that sessionToken, `prompt=none`
//      and a PKCE challenge, redirects NOT followed: Okta answers with a
//      redirect to the web app whose query carries the authorization `code`;
//   3. POST /oauth2/millenium/v1/token with the code and the PKCE verifier ->
//      access token (and a refresh token, thanks to `offline_access`).
// That is what the web app itself does (`signInWithCredentials`, then
// `token.getWithoutPrompt`), minus the hidden iframe. Afterwards the refresh
// token renews the access token; the password is only replayed when the
// refresh token is refused.
//
// The account is then read through GraphQL (src/foncia/queries.js).
//
// The password and the tokens are never logged.
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { graphqlUrl, oauthBase } from './endpoints.js';
import { ERROR_CODES, FonciaError } from './errors.js';
import {
  normalizeAccount,
  normalizeAccounting,
  normalizeDocument,
  normalizeList,
  normalizeMeeting,
  normalizeTicket,
} from './normalize.js';
import {
  ACCOUNTING,
  ACCOUNTS,
  DOCUMENTS,
  DOCUMENT_SPACES,
  GENERAL_ASSEMBLIES,
  QUALITIES,
  TICKETS,
  TICKET_STATUSES,
} from './queries.js';

const logger = createLogger({ name: 'foncia-client' });

// An access token is renewed this long before it expires, so a request never
// leaves with a token that dies on the way.
const EXPIRY_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

// How many of the latest entries each sync reads: enough to see what is new
// between two syncs, few enough to stay a light client of Foncia's API.
const PAGE_SIZE = { ACCOUNTS: 50, LINES: 20, DOCUMENTS: 20, TICKETS: 50 };

/**
 * @param {object} options
 * @param {string} options.username MyFoncia e-mail
 * @param {string} options.password MyFoncia password
 * @param {object} options.endpoints see resolveEndpoints (src/foncia/endpoints.js)
 * @param {typeof fetch} [options.fetch] injected by the tests
 * @param {() => number} [options.now] injected by the tests
 */
export function createFonciaClient({
  username,
  password,
  endpoints,
  fetch = globalThis.fetch,
  now = Date.now,
}) {
  let tokens = null; // { accessToken, refreshToken, expiresAt }

  async function request(url, init = {}) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new FonciaError(ERROR_CODES.NETWORK, `${new URL(url).host}: ${err.message}`);
    }
  }

  async function readJson(response, what) {
    if (response.status === 429) {
      throw new FonciaError(ERROR_CODES.RATE_LIMITED, `${what}: HTTP 429`);
    }
    if (!response.ok) {
      throw new FonciaError(ERROR_CODES.API, `${what}: HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new FonciaError(ERROR_CODES.API, `${what}: the answer is not JSON`);
    }
  }

  // Step 1: the e-mail and the password against a one-time session token.
  async function primaryAuth() {
    const response = await request(`${endpoints.oktaUrl}/api/v1/authn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (response.status === 401 || response.status === 403) {
      throw new FonciaError(ERROR_CODES.CREDENTIALS, `authn: HTTP ${response.status}`);
    }
    const body = await readJson(response, 'authn');
    switch (body.status) {
      case 'SUCCESS':
        return body.sessionToken;
      case 'MFA_REQUIRED':
      case 'MFA_ENROLL':
      case 'MFA_CHALLENGE':
        throw new FonciaError(ERROR_CODES.MFA, `authn: ${body.status}`);
      case 'LOCKED_OUT':
        throw new FonciaError(ERROR_CODES.LOCKED, 'authn: LOCKED_OUT');
      default:
        // PASSWORD_EXPIRED, PASSWORD_WARN… : the user has something to do on
        // the web site, and the password as typed does not get them in.
        throw new FonciaError(ERROR_CODES.CREDENTIALS, `authn: ${body.status ?? 'no status'}`);
    }
  }

  // Step 2: the session token against an authorization code (PKCE).
  async function authorize(sessionToken, verifier) {
    const state = base64url(randomBytes(16));
    const query = new URLSearchParams({
      client_id: endpoints.clientId,
      response_type: 'code',
      response_mode: 'query',
      prompt: 'none',
      scope: endpoints.scopes.join(' '),
      redirect_uri: endpoints.redirectUri,
      state,
      nonce: base64url(randomBytes(16)),
      code_challenge: base64url(createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
      sessionToken,
    });
    const response = await request(`${oauthBase(endpoints)}/v1/authorize?${query}`, {
      redirect: 'manual',
    });
    const location = response.headers.get('location');
    if (!location) {
      throw new FonciaError(ERROR_CODES.API, `authorize: HTTP ${response.status} without redirect`);
    }
    const params = new URL(location, endpoints.redirectUri).searchParams;
    if (params.get('error')) {
      // `access_denied`: the user is not assigned to the app — the account
      // exists, but not for MyFoncia.
      const code =
        params.get('error') === 'access_denied' ? ERROR_CODES.CREDENTIALS : ERROR_CODES.API;
      throw new FonciaError(code, `authorize: ${params.get('error')}`);
    }
    if (params.get('state') !== state || !params.get('code')) {
      throw new FonciaError(ERROR_CODES.API, 'authorize: no code, or a state that is not ours');
    }
    return params.get('code');
  }

  async function tokenRequest(form) {
    const response = await request(`${oauthBase(endpoints)}/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: endpoints.clientId, ...form }),
    });
    if (response.status === 400 || response.status === 401) {
      throw new FonciaError(ERROR_CODES.CREDENTIALS, `token: HTTP ${response.status}`);
    }
    const body = await readJson(response, 'token');
    if (!body.access_token) {
      throw new FonciaError(ERROR_CODES.API, 'token: no access_token');
    }
    tokens = {
      accessToken: body.access_token,
      // Okta only sends a new refresh token when rotation is on: keep the old one.
      refreshToken: body.refresh_token ?? tokens?.refreshToken ?? null,
      expiresAt: now() + Number(body.expires_in ?? 3600) * 1000,
    };
  }

  async function signIn() {
    if (!endpoints.clientId) {
      throw new FonciaError(ERROR_CODES.NOT_CONFIGURED, 'no Okta client id');
    }
    tokens = null;
    const sessionToken = await primaryAuth();
    const verifier = base64url(randomBytes(48));
    const code = await authorize(sessionToken, verifier);
    await tokenRequest({
      grant_type: 'authorization_code',
      redirect_uri: endpoints.redirectUri,
      code,
      code_verifier: verifier,
    });
    logger.info('Signed in to MyFoncia');
  }

  async function accessToken() {
    if (tokens && tokens.expiresAt - EXPIRY_MARGIN_MS > now()) {
      return tokens.accessToken;
    }
    if (tokens?.refreshToken) {
      try {
        await tokenRequest({
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
          scope: endpoints.scopes.join(' '),
        });
        logger.debug('MyFoncia access token renewed');
        return tokens.accessToken;
      } catch (err) {
        if (err.code === ERROR_CODES.NETWORK) {
          throw err;
        }
        logger.debug(`Refresh token refused (${err.message}): signing in again`);
      }
    }
    await signIn();
    return tokens.accessToken;
  }

  // One GraphQL operation. An expired or revoked token (HTTP 401, or an
  // UNAUTHENTICATED error) gets one fresh sign-in, then the error is the
  // user's to see.
  async function graphql(query, variables, retried = false) {
    const operationName = /(?:query|mutation) (\w+)/.exec(query)[1];
    const token = await accessToken();
    const response = await request(graphqlUrl(endpoints), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ operationName, query, variables }),
    });
    const body = response.status === 401 ? null : await readJson(response, operationName);
    const errors = body?.errors ?? [];
    const unauthenticated =
      response.status === 401 ||
      errors.some((error) => error?.extensions?.code === 'UNAUTHENTICATED');
    if (unauthenticated && !retried) {
      tokens = null;
      return graphql(query, variables, true);
    }
    if (unauthenticated) {
      throw new FonciaError(ERROR_CODES.CREDENTIALS, `${operationName}: unauthenticated`);
    }
    if (errors.length > 0 && !body?.data) {
      throw new FonciaError(
        ERROR_CODES.API,
        `${operationName}: ${errors.map((error) => error?.message).join('; ')}`,
      );
    }
    return body?.data ?? {};
  }

  return {
    /** Sign in from scratch: the "Test the connection" button. */
    signIn,

    /** Forget the tokens (configuration changed). */
    signOut() {
      tokens = null;
    },

    async getAccounts() {
      const data = await graphql(ACCOUNTS, { itemsPerPage: PAGE_SIZE.ACCOUNTS, pageNumber: 1 });
      return normalizeList(data.accounts, normalizeAccount);
    },

    /** Balance and next amount due of one account. */
    async getSummary(account) {
      const data = await graphql(ACCOUNTING, { uuid: account.id, first: PAGE_SIZE.LINES });
      const today = new Date(now()).toISOString().slice(0, 10);
      return normalizeAccounting(data.account?.accounting, today);
    },

    /** The latest documents of every space the account can read, newest first. */
    async getDocuments(account) {
      const spaces = DOCUMENT_SPACES[account.quality] ?? DOCUMENT_SPACES[QUALITIES.CO_OWNER];
      const documents = new Map();
      for (const space of spaces) {
        const data = await graphql(DOCUMENTS, {
          accountUuid: account.id,
          first: PAGE_SIZE.DOCUMENTS,
          customerPortalCategory: space,
        });
        for (const document of normalizeList(data.account?.documents, normalizeDocument)) {
          documents.set(document.id, document);
        }
      }
      return [...documents.values()];
    },

    /** The requests made to the manager (repairs, incidents, questions). */
    async getIncidents(account) {
      const data = await graphql(TICKETS, {
        accountUuid: account.id,
        first: PAGE_SIZE.TICKETS,
        status: TICKET_STATUSES,
      });
      return normalizeList(data.tickets, normalizeTicket);
    },

    /** The general assemblies to come: co-owners only. */
    async getMeetings(account) {
      if (account.quality !== QUALITIES.CO_OWNER) {
        return [];
      }
      const data = await graphql(GENERAL_ASSEMBLIES, { accountUuid: account.id });
      const meetings = [
        data.account?.nextGeneralAssembly,
        ...(data.account?.nextGeneralAssemblies ?? []),
      ];
      const unique = new Map();
      for (const meeting of normalizeList(meetings.filter(Boolean), normalizeMeeting)) {
        unique.set(meeting.id, meeting);
      }
      return [...unique.values()];
    },
  };
}

function base64url(buffer) {
  return buffer.toString('base64url');
}
