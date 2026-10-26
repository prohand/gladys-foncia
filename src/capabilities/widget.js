// -----------------------------------------------------------------------------
// Dashboard widget (SDK v0.14+, Gladys 5.1+): "Foncia account".
//
// Declared in the manifest `widgets` field, registered by index.js with
// `gladys.onWidgetGet` / `gladys.onWidgetAction`. The content is declarative
// (the core renders it with its own theme, dark mode included):
//   - four tiles computed from the last sync (balance, amount due, last payment,
//     new documents): they always show a value — 0 when nothing is due, a dash
//     only when MyFoncia could not be read — even before the account device is
//     created in Gladys;
//   - a status list computed here: connection, last sync, next due date, next
//     general assembly;
//   - the latest documents;
//   - two buttons: sync now, and mark the documents as seen.
//
// The widget instance can be bound to one account (`device` setting, a
// `"source": "devices"` select); without it, the first account is shown.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { MYFONCIA_URL } from '../foncia/endpoints.js';
import { describeError } from '../foncia/errors.js';
import { DOCUMENT_CATEGORIES } from '../foncia/normalize.js';
import { LANGUAGES, localize } from '../i18n.js';

const logger = createLogger({ name: 'widget' });

export const ACCOUNT_WIDGET = 'foncia_account';

export const WIDGET_ACTIONS = { SYNC: 'sync', MARK_SEEN: 'mark_seen' };

const MAX_DOCUMENTS = 5;

const T = {
  balance: { en: 'Balance', fr: 'Solde', de: 'Saldo', es: 'Saldo' },
  due: { en: 'Amount due', fr: 'À payer', de: 'Fälliger Betrag', es: 'Importe debido' },
  lastPayment: {
    en: 'Last payment',
    fr: 'Dernier règlement',
    de: 'Letzte Zahlung',
    es: 'Último pago',
  },
  documents: {
    en: 'New documents',
    fr: 'Nouveaux documents',
    de: 'Neue Dokumente',
    es: 'Documentos nuevos',
  },
  connection: { en: 'MyFoncia', fr: 'MyFoncia', de: 'MyFoncia', es: 'MyFoncia' },
  connected: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  disconnected: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  lastSync: {
    en: 'Last sync',
    fr: 'Dernière synchro',
    de: 'Letzte Synchronisierung',
    es: 'Última sincronización',
  },
  never: { en: 'Never', fr: 'Jamais', de: 'Nie', es: 'Nunca' },
  nextDue: {
    en: 'Next due date',
    fr: 'Prochaine échéance',
    de: 'Nächste Fälligkeit',
    es: 'Próximo vencimiento',
  },
  nextMeeting: {
    en: 'Next general assembly',
    fr: 'Prochaine AG',
    de: 'Nächste Eigentümerversammlung',
    es: 'Próxima junta',
  },
  none: { en: 'None planned', fr: 'Aucune prévue', de: 'Keine geplant', es: 'Ninguna prevista' },
  noDocument: {
    en: 'No document on MyFoncia yet.',
    fr: 'Aucun document sur MyFoncia pour le moment.',
    de: 'Noch kein Dokument auf MyFoncia.',
    es: 'Todavía no hay documentos en MyFoncia.',
  },
  documentsUnreadable: {
    en: 'Documents unreadable on MyFoncia: see the logs.',
    fr: 'Documents MyFoncia illisibles : voir les logs.',
    de: 'MyFoncia-Dokumente nicht lesbar: siehe Logs.',
    es: 'Documentos de MyFoncia ilegibles: vea los registros.',
  },
  noData: {
    en: 'Waiting for the first sync with MyFoncia.',
    fr: 'En attente de la première synchronisation avec MyFoncia.',
    de: 'Warte auf die erste Synchronisierung mit MyFoncia.',
    es: 'Esperando la primera sincronización con MyFoncia.',
  },
  sync: { en: 'Sync now', fr: 'Synchroniser', de: 'Synchronisieren', es: 'Sincronizar' },
  markSeen: {
    en: 'Mark as seen',
    fr: 'Marquer comme vu',
    de: 'Als gesehen',
    es: 'Marcar como visto',
  },
  open: { en: 'Open MyFoncia', fr: 'Ouvrir MyFoncia', de: 'MyFoncia öffnen', es: 'Abrir MyFoncia' },
};

// Badges are capped at 16 characters.
const CATEGORY_BADGES = {
  [DOCUMENT_CATEGORIES.CALL_FOR_FUNDS]: {
    text: { en: 'Call for funds', fr: 'Appel de fonds', de: 'Zahlungsaufruf', es: 'Cuota' },
    color: WIDGET_COLORS.WARNING,
  },
  [DOCUMENT_CATEGORIES.MEETING]: {
    text: { en: 'Meeting', fr: 'AG', de: 'Versammlung', es: 'Junta' },
    color: WIDGET_COLORS.INFO,
  },
  [DOCUMENT_CATEGORIES.STATEMENT]: {
    text: { en: 'Statement', fr: 'Relevé', de: 'Abrechnung', es: 'Extracto' },
    color: WIDGET_COLORS.NEUTRAL,
  },
  [DOCUMENT_CATEGORIES.INVOICE]: {
    text: { en: 'Invoice', fr: 'Facture', de: 'Rechnung', es: 'Factura' },
    color: WIDGET_COLORS.NEUTRAL,
  },
  [DOCUMENT_CATEGORIES.OTHER]: {
    text: { en: 'Document', fr: 'Document', de: 'Dokument', es: 'Documento' },
    color: WIDGET_COLORS.NEUTRAL,
  },
};

/** A date (YYYY-MM-DD or Date) the way the reader writes it, in every language. */
function formatDate(value, withTime = false) {
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00Z`);
  return localize((language) =>
    date.toLocaleString(language, {
      day: 'numeric',
      month: 'short',
      year: withTime ? undefined : 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      timeZone: withTime ? undefined : 'UTC',
    }),
  );
}

function statusItems(service, snapshot) {
  const { status } = service;
  const items = [
    {
      label: T.connection,
      icon: 'cloud',
      value: status.connected ? T.connected : T.disconnected,
      color: status.connected ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
    },
    {
      label: T.lastSync,
      icon: 'refresh-cw',
      value: status.lastSync ? formatDate(status.lastSync, true) : T.never,
      color: WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (!status.connected && status.error) {
    // The reason, shortened to what a status row holds (40 characters).
    const reason = describeError(status.error);
    items[0].value = Object.fromEntries(
      LANGUAGES.map((language) => [language, truncate(reason[language], 40)]),
    );
  }
  if (snapshot) {
    const late = snapshot.daysUntilDue !== null && snapshot.daysUntilDue < 0;
    items.push(
      {
        label: T.nextDue,
        icon: 'calendar',
        value: snapshot.due?.date ? formatDate(snapshot.due.date) : T.none,
        color: late ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
      },
      {
        label: T.nextMeeting,
        icon: 'users',
        value: snapshot.nextMeetingDate ? formatDate(snapshot.nextMeetingDate) : T.none,
        color: WIDGET_COLORS.NEUTRAL,
      },
    );
  }
  return items;
}

function documentList(snapshot) {
  if (!snapshot.documentsRead) {
    return { type: 'text', text: T.documentsUnreadable, variant: 'caption' };
  }
  const documents = snapshot.documents.slice(0, MAX_DOCUMENTS);
  if (documents.length === 0) {
    return { type: 'text', text: T.noDocument, variant: 'caption' };
  }
  return {
    type: 'card-list',
    display: 'list',
    items: documents.map((document) => ({
      title: truncate(document.title, 60),
      ...(document.date ? { date: document.date } : {}),
      badge: CATEGORY_BADGES[document.category] ?? CATEGORY_BADGES[DOCUMENT_CATEGORIES.OTHER],
      links: [{ url: MYFONCIA_URL, label: T.open }],
    })),
  };
}

// What a tile shows when MyFoncia could not tell: a dash, never "no value".
const UNKNOWN = '—';

/** A tile with a value computed from the snapshot. */
function tile(label, icon, value, unit, color) {
  const known = typeof value === 'number' && Number.isFinite(value);
  return {
    type: 'value',
    label,
    icon,
    value: known ? value : UNKNOWN,
    ...(known && unit ? { unit } : {}),
    ...(known && color ? { color } : {}),
  };
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const WIDGETS = {
  [ACCOUNT_WIDGET]: {
    async get(gladys, { settings, service }) {
      logger.debug(`onWidgetGet <- ${ACCOUNT_WIDGET}`);
      const snapshot = service.snapshotOf(settings?.device || undefined);
      const buttons = [
        {
          type: 'button',
          label: T.sync,
          icon: 'refresh-cw',
          style: 'secondary',
          action: { key: WIDGET_ACTIONS.SYNC },
        },
      ];
      if (!snapshot) {
        return {
          ttl_seconds: 300,
          components: [
            { type: 'text', text: T.noData, variant: 'body' },
            { type: 'status', items: statusItems(service, null) },
            ...buttons,
          ],
        };
      }
      return {
        // The tiles come from the last sync, which nudges the widget after
        // every run (index.js): the TTL is only a safety net.
        ttl_seconds: 900,
        components: [
          tile(T.balance, 'credit-card', snapshot.balance, '€'),
          tile(
            T.due,
            'file-text',
            snapshot.amountDue,
            '€',
            snapshot.amountDue > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
          ),
          tile(T.lastPayment, 'check-circle', snapshot.lastPayment?.amount, '€'),
          tile(
            T.documents,
            'inbox',
            snapshot.unseenDocuments,
            undefined,
            snapshot.unseenDocuments > 0 ? WIDGET_COLORS.INFO : undefined,
          ),
          { type: 'status', items: statusItems(service, snapshot) },
          documentList(snapshot),
          ...buttons,
          {
            type: 'button',
            label: T.markSeen,
            icon: 'check',
            style: 'secondary',
            // Declared here and sent back as is: never user input.
            action: { key: WIDGET_ACTIONS.MARK_SEEN, params: { device: snapshot.device } },
          },
        ],
      };
    },

    async action(gladys, { actionKey, params, service }) {
      logger.info(`onWidgetAction <- ${ACCOUNT_WIDGET}.${actionKey}`);
      if (actionKey === WIDGET_ACTIONS.SYNC) {
        const status = await service.sync();
        return status.connected
          ? {
              en: 'MyFoncia synced.',
              fr: 'MyFoncia synchronisé.',
              de: 'MyFoncia synchronisiert.',
              es: 'MyFoncia sincronizado.',
            }
          : describeError(status.error);
      }
      if (actionKey === WIDGET_ACTIONS.MARK_SEEN) {
        const cleared = await service.markDocumentsSeen(params?.device);
        return {
          en: `${cleared} document(s) marked as seen.`,
          fr: `${cleared} document(s) marqué(s) comme vu(s).`,
          de: `${cleared} Dokument(e) als gesehen markiert.`,
          es: `${cleared} documento(s) marcado(s) como visto(s).`,
        };
      }
      // Throwing acks the action as failed: the message reaches the user.
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },
};

/** Ask the core to re-pull every widget now (after a sync, a config change). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
