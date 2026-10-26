import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  MAX_SYNC_INTERVAL,
  MIN_SYNC_INTERVAL,
  hasCredentials,
  normalizeConfig,
} from '../src/config.js';
import {
  DEFAULT_ENDPOINTS,
  apiPath,
  oauthBase,
  resolveEndpoints,
} from '../src/foncia/endpoints.js';

test('an empty configuration gets the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('numbers typed as strings are read, emptied ones fall back to the default', () => {
  const config = normalizeConfig({ sync_interval: '30', due_reminder_days: '' });
  assert.equal(config.sync_interval, 30);
  assert.equal(config.due_reminder_days, DEFAULT_CONFIG.due_reminder_days);
});

test('the sync interval stays between its bounds', () => {
  assert.equal(normalizeConfig({ sync_interval: 1 }).sync_interval, MIN_SYNC_INTERVAL);
  assert.equal(normalizeConfig({ sync_interval: 99999 }).sync_interval, MAX_SYNC_INTERVAL);
  assert.equal(normalizeConfig({ sync_interval: 'abc' }).sync_interval, 60);
});

test('the e-mail is trimmed, the password never is', () => {
  const config = normalizeConfig({ username: ' me@example.com ', password: ' secret ' });
  assert.equal(config.username, 'me@example.com');
  assert.equal(config.password, ' secret ');
  assert.equal(hasCredentials(config), true);
  assert.equal(hasCredentials(normalizeConfig({ username: 'me@example.com' })), false);
});

test('the advanced settings override the built-in endpoints only when filled', () => {
  assert.deepEqual(resolveEndpoints(normalizeConfig()), DEFAULT_ENDPOINTS);
  const endpoints = resolveEndpoints(
    normalizeConfig({ okta_client_id: ' 0oa123 ', api_url: 'https://api.example.com/' }),
  );
  assert.equal(endpoints.clientId, '0oa123');
  assert.equal(endpoints.apiUrl, 'https://api.example.com');
  assert.equal(
    apiPath(endpoints, 'documents', 'A 1'),
    'https://api.example.com/accounts/A%201/documents',
  );
  assert.throws(() => apiPath(endpoints, 'nope'), /Unknown MyFoncia endpoint/);
});

test('the Okta base URL follows the authorization server', () => {
  assert.equal(oauthBase(DEFAULT_ENDPOINTS), 'https://foncia.okta-emea.com/oauth2');
  assert.equal(
    oauthBase({ ...DEFAULT_ENDPOINTS, authorizationServer: 'default' }),
    'https://foncia.okta-emea.com/oauth2/default',
  );
});
