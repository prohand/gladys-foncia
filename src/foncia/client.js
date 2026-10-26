// -----------------------------------------------------------------------------
// MyFoncia client: sign in, keep the token fresh, read the account.
//
// Sign-in is the standard Okta flow a single-page app runs, done without a
// browser:
//   1. POST /api/v1/authn with the e-mail and password -> a one-time
//      `sessionToken` (or a status saying why not: MFA, locked account…);
//   2. GET /oauth2/v1/authorize with that sessionToken and a PKCE challenge,
//      redirects NOT followed: Okta answers with a redirect to the web app
//      whose query carries the authorization `code`;
//   3. POST /oauth2/v1/token with the code and the PKCE verifier -> access
//      token (and a refresh token, thanks to `offline_access`).
// Afterwards the refresh token renews the access token; the password is only
// replayed when the refresh token is refused.
//
// The password and the tokens are never logged.
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { apiPath, oauthBase } from './endpoints.js';
import { ERROR_CODES, FonciaError } from './errors.js';
import {
  normalizeAccount,
  normalizeDocument,
  normalizeIncident,
  normalizeList,
  normalizeMeeting,
  normalizeSummary,
} from './normalize.js';

const logger = createLogger({ name: 'foncia-client' });

// An access token is renewed this long before it expires, so a request never
// leaves with a token that dies on the way.
const EXPIRY_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

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

  // GET one API path. A 401 means the token died early (revoked, password
  // changed elsewhere): one fresh sign-in, then the error is the user's to see.
  async function get(name, accountId, retried = false) {
    const token = await accessToken();
    const response = await request(apiPath(endpoints, name, accountId), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (response.status === 401 && !retried) {
      tokens = null;
      return get(name, accountId, true);
    }
    if (response.status === 401) {
      throw new FonciaError(ERROR_CODES.CREDENTIALS, `${name}: HTTP 401`);
    }
    return readJson(response, name);
  }

  return {
    /** Sign in from scratch: the "Test the connection" button. */
    signIn,

    /** Forget the tokens (configuration changed). */
    signOut() {
      tokens = null;
    },

    async getAccounts() {
      return normalizeList(await get('accounts'), normalizeAccount, 'accounts', 'comptes');
    },

    async getSummary(accountId) {
      return normalizeSummary(await get('summary', accountId));
    },

    async getDocuments(accountId) {
      return normalizeList(await get('documents', accountId), normalizeDocument, 'documents');
    },

    async getIncidents(accountId) {
      return normalizeList(
        await get('incidents', accountId),
        normalizeIncident,
        'incidents',
        'sinistres',
        'interventions',
      );
    },

    async getMeetings(accountId) {
      return normalizeList(
        await get('meetings', accountId),
        normalizeMeeting,
        'meetings',
        'assemblies',
        'assemblees',
      );
    },
  };
}

function base64url(buffer) {
  return buffer.toString('base64url');
}
