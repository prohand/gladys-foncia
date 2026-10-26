// -----------------------------------------------------------------------------
// Integration configuration.
//
// The user fills it in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`; the SDK fetches it (`gladys.getConfig()`)
// and notifies every change (`gladys.onConfigUpdated()`).
//
// This module provides the defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined` or with a number typed
// as a string.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  username: '', // MyFoncia login (e-mail address)
  password: '', // MyFoncia password, a `secret` field: never logged
  sync_interval: 60, // minutes between two reads of the MyFoncia account
  due_reminder_days: 7, // the `payment_due` trigger fires this many days before a due date
  // Advanced: the MyFoncia API is not public. These two override the values of
  // src/foncia/endpoints.js without rebuilding the image; empty = built-in value.
  okta_client_id: '',
  api_url: '',
};

// A cloud account, not a sensor: MyFoncia data moves a few times a month, and
// reading it every minute would only get the account rate-limited.
export const MIN_SYNC_INTERVAL = 15;
export const MAX_SYNC_INTERVAL = 1440;

export const MIN_REMINDER_DAYS = 0;
export const MAX_REMINDER_DAYS = 60;

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    username: String(raw.username ?? DEFAULT_CONFIG.username).trim(),
    // A password may legitimately start or end with a space: never trimmed.
    password: String(raw.password ?? DEFAULT_CONFIG.password),
    sync_interval: clamp(
      raw.sync_interval,
      DEFAULT_CONFIG.sync_interval,
      MIN_SYNC_INTERVAL,
      MAX_SYNC_INTERVAL,
    ),
    due_reminder_days: clamp(
      raw.due_reminder_days,
      DEFAULT_CONFIG.due_reminder_days,
      MIN_REMINDER_DAYS,
      MAX_REMINDER_DAYS,
    ),
    okta_client_id: String(raw.okta_client_id ?? '').trim(),
    api_url: String(raw.api_url ?? '')
      .trim()
      .replace(/\/+$/, ''),
  };
}

/** Whether the user filled in what a login needs. */
export function hasCredentials(config) {
  return Boolean(config.username && config.password);
}

// An emptied number field arrives as '' (which `Number()` reads as 0): it means
// "the default", not zero.
function clamp(value, fallback, min, max) {
  if (value === '' || value === null || value === undefined) {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}
