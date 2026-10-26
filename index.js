// -----------------------------------------------------------------------------
// Entry point of the Foncia integration for Gladys Assistant.
//
// Role of this file: wire the SDK to the Foncia service (src/foncia/). It holds
// NO MyFoncia logic. It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects, then starts the periodic sync.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { createStore } from './src/foncia/store.js';
import { createFonciaService } from './src/foncia/sync.js';
import { describeError } from './src/foncia/errors.js';
import { buildAccountDevice } from './src/devices/account.js';
import { SCENE_ACTIONS } from './src/capabilities/scenes.js';
import { WIDGETS, refreshWidgets } from './src/capabilities/widget.js';

const gladys = new GladysIntegration();
const store = createStore();
const service = createFonciaService({
  gladys,
  store,
  onSynced: () => refreshWidgets(gladys),
});

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();
service.configure(config);

// --- Discovery: Gladys asks for the list of devices --------------------------
// The accounts come from MyFoncia: a sync (re)publishes them.
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> syncing the MyFoncia accounts');
  const status = await service.sync();
  if (status.connected) {
    await gladys.publishDiscoveredDevices(
      status.snapshots.map((snapshot) => buildAccountDevice(gladys, snapshot.account)),
    );
  }
});

// --- Commands: every feature is read-only ------------------------------------
gladys.onSetValue(async (device) => {
  throw new Error(`${device.external_id} is read-only`);
});

// --- Manifest actions: buttons in the Configuration screen -------------------
gladys.onAction('test_connection', async () => {
  logger.info('Action test_connection');
  try {
    const accounts = await service.testConnection();
    const names = accounts.map((account) => account.name).join(', ');
    return {
      en: `Connected to MyFoncia: ${accounts.length} account(s). ${names}`.trim(),
      fr: `Connecté à MyFoncia : ${accounts.length} compte(s). ${names}`.trim(),
      de: `Mit MyFoncia verbunden: ${accounts.length} Konto/Konten. ${names}`.trim(),
      es: `Conectado a MyFoncia: ${accounts.length} cuenta(s). ${names}`.trim(),
    };
  } catch (err) {
    logger.warn(`Test failed: ${err.message}`);
    return describeError(err);
  }
});

gladys.onAction('sync_now', async () => {
  logger.info('Action sync_now');
  const status = await service.sync();
  if (!status.connected) {
    return describeError(status.error);
  }
  return {
    en: `Sync done: ${status.snapshots.length} account(s) up to date.`,
    fr: `Synchronisation faite : ${status.snapshots.length} compte(s) à jour.`,
    de: `Synchronisierung fertig: ${status.snapshots.length} Konto/Konten aktuell.`,
    es: `Sincronización hecha: ${status.snapshots.length} cuenta(s) al día.`,
  };
});

// --- Scene actions (Gladys 5.1+) ---------------------------------------------
// Scene TRIGGERS need no handler: the sync fires them (src/foncia/sync.js).
for (const [actionKey, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(actionKey, (fields) => handler(service, { fields }));
}

// --- Dashboard widget (Gladys 5.1+) ------------------------------------------
for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(widgetKey, (request) => widget.get(gladys, { ...request, service }));
  gladys.onWidgetAction(widgetKey, (actionKey, params, { settings }) =>
    widget.action(gladys, { actionKey, params, settings, service }),
  );
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  // New credentials or a new interval: a new client, the timer re-armed, and
  // a sync right away so the user sees the outcome.
  service.configure(config);
  await service.start();
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await store.load();
    service.configure(config);
    // start() syncs at once, then every `sync_interval` minutes. It reports
    // the connection status itself (setConnectionStatus), good or bad.
    await service.start();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
        de: 'Die Initialisierung ist fehlgeschlagen, siehe die Logs der Integration.',
        es: 'La inicialización ha fallado, consulte los registros de la integración.',
      })
      .catch(() => {});
  }
});

gladys.on('disconnected', () => {
  service.stop();
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  service.stop();
  await store.save();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Foncia integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
