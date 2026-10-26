// -----------------------------------------------------------------------------
// The sync: read every MyFoncia account, update Gladys, fire what is new.
//
// One sync = one sign-in at most (the token is reused), then for each account
// its summary, documents, incidents and meetings. From that:
//   - the account devices are (re)published, then their states — only the
//     values that changed, plus a daily heartbeat so the charts keep a point;
//   - the scene triggers fire for what the memory (src/foncia/store.js) had
//     not seen yet;
//   - the connection status, the transport badges and the widget follow.
//
// A sync runs on a timer (the configured interval), at start-up, and on
// demand (configuration button, scene action, widget button). Two requests at
// the same time share the same run.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { accountIds, accountStates, buildAccountDevice } from '../devices/account.js';
import {
  MAX_EVENTS_PER_KIND,
  incidentUpdatedEvent,
  meetingScheduledEvent,
  newDocumentEvent,
  paymentDueEvent,
} from '../capabilities/triggers.js';
import { hasCredentials } from '../config.js';
import { createFonciaClient } from './client.js';
import { resolveEndpoints } from './endpoints.js';
import { ERROR_CODES, FonciaError, describeError } from './errors.js';
import { INCIDENT_STATUSES, daysBetween } from './normalize.js';

const logger = createLogger({ name: 'sync' });

// Unchanged values are re-sent once a day: a balance that does not move still
// draws a flat line instead of a gap.
const HEARTBEAT_MS = 24 * 3600 * 1000;

// Bounds of the memory, so /data does not grow forever.
const MAX_REMEMBERED_DOCUMENTS = 1000;
const MAX_REMEMBERED_DUES = 24;
const MAX_REMEMBERED_MEETINGS = 50;

/**
 * Compare what MyFoncia lists for one account with what was seen before.
 * Updates `memory` in place and returns the snapshot and the events to fire.
 *
 * Pure apart from `memory`: the tests call it directly.
 *
 * @param {object} input
 * @param {string} input.device external id of the account device
 * @param {object} input.account normalized account
 * @param {object|null} input.summary normalized summary (null: could not be read)
 * @param {Array|null} input.documents null when the list could not be read
 * @param {Array|null} input.incidents null when the list could not be read
 * @param {Array|null} input.meetings null when the list could not be read
 * @param {object} input.memory memory of this account (see emptyAccountMemory)
 * @param {boolean} input.firstSync true: learn, fire nothing
 * @param {string} input.today YYYY-MM-DD
 * @param {number} input.reminderDays payment_due fires this many days ahead
 */
export function analyzeAccount({
  device,
  account,
  summary,
  documents,
  incidents,
  meetings,
  memory,
  firstSync,
  today,
  reminderDays,
}) {
  const events = [];
  const push = (kind, event) => {
    kind.count += 1;
    if (!firstSync && kind.count <= MAX_EVENTS_PER_KIND) {
      events.push(event);
    }
  };

  // Documents: an id never seen is new, and counts as "not seen yet" until
  // the user acknowledges it (scene action or widget button).
  if (documents) {
    const known = new Set(memory.documents);
    const fresh = documents.filter((document) => !known.has(document.id));
    const kind = { count: 0 };
    for (const document of fresh) {
      push(kind, newDocumentEvent(device, account, document));
      if (!firstSync) {
        memory.unseen.push(document.id);
      }
    }
    memory.documents = [...memory.documents, ...fresh.map((d) => d.id)].slice(
      -MAX_REMEMBERED_DOCUMENTS,
    );
    // A document MyFoncia no longer lists is no longer "new".
    const listed = new Set(documents.map((document) => document.id));
    memory.unseen = memory.unseen.filter((id) => listed.has(id));
  }

  // Incidents: new ones (unless they are born closed) and status changes.
  if (incidents) {
    const kind = { count: 0 };
    const statuses = {};
    for (const incident of incidents) {
      const previous = memory.incidents[incident.id];
      statuses[incident.id] = incident.status;
      const isNew = previous === undefined && incident.status !== INCIDENT_STATUSES.CLOSED;
      const changed = previous !== undefined && previous !== incident.status;
      if (isNew || changed) {
        push(kind, incidentUpdatedEvent(device, account, incident, previous));
      }
    }
    memory.incidents = statuses;
  }

  // The due date: one reminder per due (date and amount), once inside the
  // window. A due already inside the window at the first sync is learnt.
  const due = summary?.due?.date ? summary.due : null;
  const daysUntilDue = due ? daysBetween(today, due.date) : null;
  if (due && due.amount > 0 && daysUntilDue >= 0 && daysUntilDue <= reminderDays) {
    const key = `${due.date}:${due.amount}`;
    if (!memory.reminded.includes(key)) {
      push({ count: 0 }, paymentDueEvent(device, account, due, daysUntilDue));
      memory.reminded = [...memory.reminded, key].slice(-MAX_REMEMBERED_DUES);
    }
  }

  // Meetings: the next one to come, and an event for every newly announced one.
  const upcoming = (meetings ?? [])
    .filter((meeting) => meeting.date && meeting.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (meetings) {
    const known = new Set(memory.meetings);
    const kind = { count: 0 };
    for (const meeting of upcoming.filter((m) => !known.has(m.id))) {
      push(kind, meetingScheduledEvent(device, account, meeting, daysBetween(today, meeting.date)));
    }
    memory.meetings = [...new Set([...memory.meetings, ...meetings.map((m) => m.id)])].slice(
      -MAX_REMEMBERED_MEETINGS,
    );
  }
  const nextMeetingDate =
    upcoming[0]?.date ??
    (summary?.nextMeetingDate && summary.nextMeetingDate >= today ? summary.nextMeetingDate : null);

  return {
    events,
    snapshot: {
      device,
      account,
      balance: summary?.balance ?? null,
      due,
      daysUntilDue,
      openIncidents: incidents
        ? incidents.filter((incident) => incident.status !== INCIDENT_STATUSES.CLOSED).length
        : null,
      unseenDocuments: documents ? memory.unseen.length : null,
      nextMeetingDate,
      daysUntilMeeting: nextMeetingDate ? daysBetween(today, nextMeetingDate) : null,
      // Latest first, for the widget.
      documents: [...(documents ?? [])].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
      incidents: incidents ?? [],
    },
  };
}

/**
 * The service the rest of the integration talks to.
 *
 * @param {object} options
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
 * @param {ReturnType<import('./store.js').createStore>} options.store
 * @param {typeof createFonciaClient} [options.createClient] injected by the tests
 * @param {(status: object) => void} [options.onSynced] called after every sync, good or not
 * @param {() => Date} [options.now] injected by the tests
 */
export function createFonciaService({
  gladys,
  store,
  createClient = createFonciaClient,
  onSynced = () => {},
  now,
}) {
  const clock = now ?? (() => new Date());
  let config = null;
  let client = null;
  let timer = null;
  let running = null;
  let publishedDevices = '';

  const status = {
    connected: false,
    error: null, // the last FonciaError, null after a good sync
    lastSync: null, // Date of the last good sync
    snapshots: [], // one per account, in MyFoncia order
  };

  async function runSync() {
    if (!client) {
      throw new FonciaError(ERROR_CODES.NO_CREDENTIALS, 'no credentials');
    }
    const today = clock().toISOString().slice(0, 10);
    const accounts = await client.getAccounts();
    const results = [];
    for (const account of accounts) {
      // One list that fails (an endpoint this account has no access to: a
      // tenant has no general assembly) must not hide the others.
      const part = (name, read) =>
        read().catch((err) => {
          if (err.code === ERROR_CODES.NETWORK || err.code === ERROR_CODES.CREDENTIALS) {
            throw err;
          }
          logger.warn(`${account.name}: could not read the ${name} (${err.message})`);
          return null;
        });
      const [summary, documents, incidents, meetings] = await Promise.all([
        part('summary', () => client.getSummary(account)),
        part('documents', () => client.getDocuments(account)),
        part('incidents', () => client.getIncidents(account)),
        part('meetings', () => client.getMeetings(account)),
      ]);
      const firstSync = !store.knows(account.id);
      results.push(
        analyzeAccount({
          device: accountIds(gladys, account.id).device,
          account,
          summary,
          documents,
          incidents,
          meetings,
          memory: store.account(account.id),
          firstSync,
          today,
          reminderDays: config.due_reminder_days,
        }),
      );
    }

    // Devices first: states and events reference them.
    const devices = accounts.map((account) => buildAccountDevice(gladys, account));
    const fingerprint = JSON.stringify(devices);
    if (fingerprint !== publishedDevices) {
      await gladys.publishDiscoveredDevices(devices);
      publishedDevices = fingerprint;
    }
    const states = results.flatMap(({ snapshot }) => accountStates(gladys, snapshot));
    if (states.length > 0) {
      await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    }
    if (devices.length > 0) {
      await gladys.publishTransports(
        devices.map((device) => ({
          external_id: device.external_id,
          transport: DEVICE_TRANSPORTS.CLOUD,
        })),
      );
    }
    // The memory is saved before the events: a crash in between loses an
    // event rather than firing it twice at the next start.
    await store.save();
    for (const { events } of results) {
      for (const { key, data } of events) {
        await gladys.publishSceneEvent(key, data).catch((err) => {
          logger.warn(`Scene event ${key} refused: ${err.message}`);
        });
      }
    }

    status.snapshots = results.map(({ snapshot }) => snapshot);
    logger.info(
      `Sync done: ${accounts.length} account(s), ` +
        `${results.reduce((n, r) => n + r.events.length, 0)} scene event(s)`,
    );
  }

  async function sync() {
    if (running) {
      return running;
    }
    running = (async () => {
      try {
        await runSync();
        status.connected = true;
        status.error = null;
        status.lastSync = clock();
        await gladys.setConnectionStatus(true).catch(() => {});
      } catch (err) {
        status.connected = false;
        status.error =
          err instanceof FonciaError ? err : new FonciaError(ERROR_CODES.API, err.message);
        logger.error(`Sync failed: ${err.message}`);
        if (status.snapshots.length > 0) {
          await gladys
            .publishTransports(
              status.snapshots.map((snapshot) => ({
                external_id: snapshot.device,
                transport: DEVICE_TRANSPORTS.UNREACHABLE,
              })),
            )
            .catch(() => {});
        }
        await gladys.setConnectionStatus(false, describeError(status.error)).catch(() => {});
      } finally {
        running = null;
        // The widget shows the last sync and its outcome.
        onSynced(status);
      }
      return status;
    })();
    return running;
  }

  return {
    status,

    /** Apply a (new) configuration: a new client. Call start() to (re)arm the timer. */
    configure(newConfig) {
      config = newConfig;
      client?.signOut();
      client = hasCredentials(config)
        ? createClient({
            username: config.username,
            password: config.password,
            endpoints: resolveEndpoints(config),
          })
        : null;
    },

    sync,

    /** Sign in from scratch and list the accounts: the "Test the connection" button. */
    async testConnection() {
      if (!client) {
        throw new FonciaError(ERROR_CODES.NO_CREDENTIALS, 'no credentials');
      }
      await client.signIn();
      return client.getAccounts();
    },

    /** Sync now, then every `sync_interval` minutes. */
    start() {
      this.stop();
      timer = setInterval(() => {
        sync().catch(() => {});
      }, config.sync_interval * 60_000);
      timer.unref?.();
      return sync();
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    /** The snapshot of one account device (or the first one when not given). */
    snapshotOf(deviceExternalId) {
      return (
        status.snapshots.find((snapshot) => snapshot.device === deviceExternalId) ??
        (deviceExternalId ? null : (status.snapshots[0] ?? null))
      );
    },

    /**
     * Acknowledge the new documents of one account (all accounts when not
     * given): the counter goes back to 0. Resolves the number cleared.
     */
    async markDocumentsSeen(deviceExternalId) {
      let cleared = 0;
      for (const snapshot of status.snapshots) {
        if (deviceExternalId && snapshot.device !== deviceExternalId) {
          continue;
        }
        const memory = store.account(snapshot.account.id);
        cleared += memory.unseen.length;
        memory.unseen = [];
        snapshot.unseenDocuments = 0;
        await gladys.publishChangedStates(accountStates(gladys, snapshot), {
          heartbeat: HEARTBEAT_MS,
        });
      }
      await store.save();
      return cleared;
    },
  };
}
