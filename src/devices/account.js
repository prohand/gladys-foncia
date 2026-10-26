// -----------------------------------------------------------------------------
// Device type: FONCIA ACCOUNT
//
// One Gladys device per MyFoncia account (a co-ownership lot, a rental): the
// figures a home cares about, read-only, with their history so they can be
// charted. MyFoncia is not a device that reports by itself: the values are
// pushed after every sync (src/foncia/sync.js), Gladys never polls them.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'account';

// Feature keys: part of the external ids, so never renamed once published.
export const FEATURES = {
  BALANCE: 'balance',
  AMOUNT_DUE: 'amount-due',
  DAYS_UNTIL_DUE: 'days-until-due',
  OPEN_INCIDENTS: 'open-incidents',
  UNSEEN_DOCUMENTS: 'unseen-documents',
  DAYS_UNTIL_MEETING: 'days-until-meeting',
};

// Wide bounds: Gladys stores min/max (NOT NULL) and a building's call for funds
// after major works can be large.
const MAX_AMOUNT = 1_000_000;
const MAX_DAYS = 3650;
const MAX_COUNT = 10_000;

/** External ids of the device of one MyFoncia account. */
export function accountIds(gladys, accountId) {
  return gladys.externalIds(DEVICE_TYPE, accountId);
}

/**
 * Discovery payload of one account.
 * @param {object} account normalized account (src/foncia/normalize.js)
 */
export function buildAccountDevice(gladys, account) {
  const ids = accountIds(gladys, account.id);
  const sensor = (key, name, category, type, unit, min, max) => ({
    name,
    external_id: ids.feature(key),
    category,
    type,
    // A counter has no unit: the key is left out rather than sent undefined.
    ...(unit ? { unit } : {}),
    min,
    max,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  });
  return {
    name: `Foncia – ${account.name}`,
    external_id: ids.device,
    features: [
      sensor(
        FEATURES.BALANCE,
        'Account balance',
        DEVICE_FEATURE_CATEGORIES.CURRENCY,
        DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
        DEVICE_FEATURE_UNITS.EURO,
        -MAX_AMOUNT,
        MAX_AMOUNT,
      ),
      sensor(
        FEATURES.AMOUNT_DUE,
        'Next amount due',
        DEVICE_FEATURE_CATEGORIES.CURRENCY,
        DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
        DEVICE_FEATURE_UNITS.EURO,
        0,
        MAX_AMOUNT,
      ),
      sensor(
        FEATURES.DAYS_UNTIL_DUE,
        'Days until the due date',
        DEVICE_FEATURE_CATEGORIES.DURATION,
        DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        DEVICE_FEATURE_UNITS.DAYS,
        -MAX_DAYS,
        MAX_DAYS,
      ),
      sensor(
        FEATURES.OPEN_INCIDENTS,
        'Open incidents',
        DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
        DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
        undefined,
        0,
        MAX_COUNT,
      ),
      sensor(
        FEATURES.UNSEEN_DOCUMENTS,
        'New documents',
        DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
        DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
        undefined,
        0,
        MAX_COUNT,
      ),
      sensor(
        FEATURES.DAYS_UNTIL_MEETING,
        'Days until the general assembly',
        DEVICE_FEATURE_CATEGORIES.DURATION,
        DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        DEVICE_FEATURE_UNITS.DAYS,
        -MAX_DAYS,
        MAX_DAYS,
      ),
    ],
  };
}

/**
 * The states of one account snapshot (src/foncia/sync.js). A value MyFoncia
 * did not give (no due date, no meeting planned) is not published: the last
 * known value stays rather than a misleading zero.
 */
export function accountStates(gladys, snapshot) {
  const ids = accountIds(gladys, snapshot.account.id);
  const values = {
    [FEATURES.BALANCE]: snapshot.balance,
    [FEATURES.AMOUNT_DUE]: snapshot.due?.amount ?? null,
    [FEATURES.DAYS_UNTIL_DUE]: snapshot.daysUntilDue,
    [FEATURES.OPEN_INCIDENTS]: snapshot.openIncidents,
    [FEATURES.UNSEEN_DOCUMENTS]: snapshot.unseenDocuments,
    [FEATURES.DAYS_UNTIL_MEETING]: snapshot.daysUntilMeeting,
  };
  return Object.entries(values)
    .filter(([, state]) => typeof state === 'number' && Number.isFinite(state))
    .map(([key, state]) => ({ device_feature_external_id: ids.feature(key), state }));
}
