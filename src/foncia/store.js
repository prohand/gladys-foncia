// -----------------------------------------------------------------------------
// What the integration remembers between two syncs, and across restarts.
//
// The scene triggers say "something NEW happened": a document, an incident
// that changed, a due date coming. Without a memory, every restart of the
// container would fire them again for everything MyFoncia lists. So what was
// already seen is kept in /data, the only writable path of the container.
//
// A file that cannot be read or written is not fatal: the integration keeps
// its memory in RAM and says so in the logs.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

export const DEFAULT_STORE_PATH = '/data/foncia-state.json';

/** The memory of one account, empty. */
export function emptyAccountMemory() {
  return {
    documents: [], // ids of the documents already seen
    unseen: [], // ids of the documents not acknowledged yet (the counter)
    incidents: {}, // id -> last status seen
    reminded: [], // "<date>:<amount>" of the dues the payment_due trigger fired for
    meetings: [], // ids of the meetings already announced
  };
}

/**
 * @param {string} [path] JSON file, `/data/foncia-state.json` in the container
 */
export function createStore(path = DEFAULT_STORE_PATH) {
  let data = { accounts: {} };
  let loaded = false;

  return {
    async load() {
      try {
        const parsed = JSON.parse(await readFile(path, 'utf8'));
        data = { accounts: parsed?.accounts ?? {} };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Could not read ${path} (${err.message}): starting from an empty memory`);
        }
        data = { accounts: {} };
      }
      loaded = true;
    },

    /** Whether this account was ever synced (its first sync fires nothing). */
    knows(accountId) {
      return accountId in data.accounts;
    },

    account(accountId) {
      data.accounts[accountId] ??= emptyAccountMemory();
      return data.accounts[accountId];
    },

    async save() {
      if (!loaded) {
        return;
      }
      try {
        await mkdir(dirname(path), { recursive: true });
        // Written aside then renamed: a container stopped mid-write never
        // leaves half a file behind.
        await writeFile(`${path}.tmp`, JSON.stringify(data));
        await rename(`${path}.tmp`, path);
      } catch (err) {
        logger.warn(`Could not write ${path} (${err.message}): the memory stays in RAM`);
      }
    },
  };
}
