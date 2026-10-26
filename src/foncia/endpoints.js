// -----------------------------------------------------------------------------
// Where MyFoncia lives.
//
// Foncia publishes no API. The MyFoncia web app (https://myfoncia.fr) signs its
// users in through Okta — the `foncia.okta-emea.com` organization answers the
// standard OpenID discovery — then reads the account through a JSON API with
// the access token it got.
//
// Everything this integration knows about that API is in this file, so the day
// Foncia moves something, there is one place to fix. The paths are relative to
// `apiUrl`; `{account}` is replaced by the account id.
//
// The two values below that are NOT confirmed against a live account (the
// Okta client id of the web app, and the API base URL) can be overridden from
// the "Advanced" section of the configuration, without a new image: see
// docs/en.md, "Advanced settings".
// -----------------------------------------------------------------------------

export const DEFAULT_ENDPOINTS = {
  // Okta organization of Foncia (public OpenID discovery document).
  oktaUrl: 'https://foncia.okta-emea.com',
  // Authorization server: '' is the Okta organization server (/oauth2/v1/...).
  authorizationServer: '',
  // Client id of the MyFoncia web app. To confirm: read it from the app's
  // config.js, or from the `client_id` of its /authorize request.
  clientId: '',
  // Where Okta sends the browser back; only read from the redirect, never opened.
  redirectUri: 'https://myfoncia.fr/login/callback',
  scopes: ['openid', 'profile', 'email', 'offline_access'],
  // To confirm: the API host the web app calls once signed in.
  apiUrl: 'https://myfoncia-gateway.fonciamillenium.net',
  paths: {
    accounts: '/accounts',
    summary: '/accounts/{account}/summary',
    documents: '/accounts/{account}/documents',
    incidents: '/accounts/{account}/incidents',
    meetings: '/accounts/{account}/meetings',
  },
};

// The page a user is sent to from the widget and the documentation.
export const MYFONCIA_URL = 'https://myfoncia.fr';

/**
 * The endpoints to use: the built-in ones, with the advanced settings of the
 * configuration on top.
 *
 * @param {{okta_client_id?: string, api_url?: string}} config normalized configuration
 */
export function resolveEndpoints(config = {}) {
  return {
    ...DEFAULT_ENDPOINTS,
    clientId: config.okta_client_id || DEFAULT_ENDPOINTS.clientId,
    apiUrl: config.api_url || DEFAULT_ENDPOINTS.apiUrl,
  };
}

/** The Okta OAuth2 base URL: `<org>/oauth2` or `<org>/oauth2/<server>`. */
export function oauthBase(endpoints) {
  const server = endpoints.authorizationServer ? `/${endpoints.authorizationServer}` : '';
  return `${endpoints.oktaUrl}/oauth2${server}`;
}

/** The URL of one API path, `{account}` filled in. */
export function apiPath(endpoints, name, accountId = '') {
  const path = endpoints.paths[name];
  if (!path) {
    throw new Error(`Unknown MyFoncia endpoint "${name}"`);
  }
  return `${endpoints.apiUrl}${path.replace('{account}', encodeURIComponent(accountId))}`;
}
