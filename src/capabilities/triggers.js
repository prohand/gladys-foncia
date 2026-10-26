// -----------------------------------------------------------------------------
// Scene triggers (SDK v0.14+, Gladys 5.1+).
//
// "Something NEW happened on MyFoncia." Each key is declared in the manifest
// `scene_triggers` field and fired by the sync (src/foncia/sync.js) with
// `gladys.publishSceneEvent(key, data)`. The core keeps only the keys of
// `data` that the trigger declares (its `fields`, used as filters, and its
// `variables`, readable by the scene), flat primitives only.
//
// What is new is decided against the memory of src/foncia/store.js: the first
// sync of an account fires nothing — it only learns what already exists.
// -----------------------------------------------------------------------------

export const TRIGGERS = {
  NEW_DOCUMENT: 'new_document',
  INCIDENT_UPDATED: 'incident_updated',
  PAYMENT_DUE: 'payment_due',
  MEETING_SCHEDULED: 'meeting_scheduled',
};

// A first sync after a long outage could find dozens of documents: past this
// many per account and per sync, the rest is counted but fires nothing, so a
// scene sending a notification per document does not flood the phone.
export const MAX_EVENTS_PER_KIND = 5;

export function newDocumentEvent(device, account, document) {
  return {
    key: TRIGGERS.NEW_DOCUMENT,
    data: {
      device,
      account: account.name,
      category: document.category,
      title: document.title,
      date: document.date ?? '',
    },
  };
}

export function incidentUpdatedEvent(device, account, incident, previousStatus) {
  return {
    key: TRIGGERS.INCIDENT_UPDATED,
    data: {
      device,
      account: account.name,
      status: incident.status,
      previous_status: previousStatus ?? '',
      title: incident.title,
    },
  };
}

export function paymentDueEvent(device, account, due, daysLeft) {
  return {
    key: TRIGGERS.PAYMENT_DUE,
    data: {
      device,
      account: account.name,
      amount: due.amount,
      due_date: due.date,
      days_left: daysLeft,
    },
  };
}

export function meetingScheduledEvent(device, account, meeting, daysLeft) {
  return {
    key: TRIGGERS.MEETING_SCHEDULED,
    data: {
      device,
      account: account.name,
      title: meeting.title,
      date: meeting.date,
      days_left: daysLeft,
    },
  };
}
