// -----------------------------------------------------------------------------
// Where MyFoncia lives.
//
// Foncia publishes no API. These values are the ones the MyFoncia web app
// (https://my-foncia.fonciamillenium.net, where myfoncia.fr redirects) loads
// from its own `/config.js` (`oktaConfig` and `graphql.url`):
//   - sign-in: the Okta organization `login.my-foncia.fonciamillenium.net`,
//     authorization server `millenium`, client of the web app;
//   - data: one GraphQL endpoint, `<apiUrl>/graphql`, called with the Okta
//     access token as a Bearer token.
//
// Everything this integration knows about Foncia's addresses is in this file,
// so the day Foncia moves something there is one place to fix. The client id
// and the API URL can also be overridden from the "Advanced settings" of the
// configuration, without a new image.
// -----------------------------------------------------------------------------

export const DEFAULT_ENDPOINTS = {
  oktaUrl: 'https://login.my-foncia.fonciamillenium.net',
  // Custom authorization server of the web app (issuer `<oktaUrl>/oauth2/millenium`).
  authorizationServer: 'millenium',
  clientId: '0oalslzunnRGZbcuX417',
  // Where Okta sends the browser back; only read from the redirect, never opened.
  redirectUri: 'https://my-foncia.fonciamillenium.net/login/callback',
  // The web app also asks for okta.myAccount.password.*, to change the
  // password: not needed to read the account.
  scopes: ['openid', 'profile', 'email', 'offline_access'],
  apiUrl: 'https://customer-portal-gateway.prod.fonciamillenium.net',
};

// The page a user is sent to from the widget and the documentation.
export const MYFONCIA_URL = 'https://my-foncia.fonciamillenium.net';

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

/** The GraphQL endpoint. */
export function graphqlUrl(endpoints) {
  return `${endpoints.apiUrl}/graphql`;
}
