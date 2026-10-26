// -----------------------------------------------------------------------------
// Scene actions (SDK v0.14+, Gladys 5.1+).
//
// Operations a scene author places in a scene, declared in the manifest
// `scene_actions` field and registered by index.js with
// `gladys.onSceneAction(key, ...)`:
//   - `sync_now`: read MyFoncia now, and hand the figures of one account to
//     the following actions ("send me my balance every 1st of the month");
//   - `mark_documents_seen`: the "new documents" counter back to 0, once the
//     notification has been read.
//
// The `fields` arrive resolved (a `"source": "devices"` field is the chosen
// device external id). The handler resolves the declared `outputs`; a failed
// sync is an output (`success: false`), not an exception: a scene action is
// never a condition, the author gates the next actions on the output.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTION_KEYS = {
  SYNC_NOW: 'sync_now',
  MARK_DOCUMENTS_SEEN: 'mark_documents_seen',
};

export const SCENE_ACTIONS = {
  async [SCENE_ACTION_KEYS.SYNC_NOW](service, { fields }) {
    logger.info(`Scene action sync_now <- ${fields.device ?? 'first account'}`);
    const status = await service.sync();
    const snapshot = service.snapshotOf(fields.device || undefined);
    return {
      success: status.connected,
      account: snapshot?.account.name ?? '',
      balance: snapshot?.balance ?? null,
      amount_due: snapshot?.due?.amount ?? null,
      due_date: snapshot?.due?.date ?? '',
      open_incidents: snapshot?.openIncidents ?? null,
      new_documents: snapshot?.unseenDocuments ?? null,
    };
  },

  async [SCENE_ACTION_KEYS.MARK_DOCUMENTS_SEEN](service, { fields }) {
    logger.info(`Scene action mark_documents_seen <- ${fields.device ?? 'all accounts'}`);
    const cleared = await service.markDocumentsSeen(fields.device || undefined);
    return { cleared };
  },
};
