// -----------------------------------------------------------------------------
// From MyFoncia GraphQL answers to the few shapes the integration works with.
//
// The API is undocumented: every read goes through here, tolerant by design.
// A field missing is `null`, an entry the integration cannot identify is
// dropped — never a crash that would stop the whole sync.
// -----------------------------------------------------------------------------

/** Account roles. */
export const ROLES = { OWNER: 'owner', TENANT: 'tenant', UNKNOWN: 'unknown' };

/** Document categories, also the options of the `new_document` trigger. */
export const DOCUMENT_CATEGORIES = {
  CALL_FOR_FUNDS: 'call_for_funds',
  MEETING: 'meeting',
  STATEMENT: 'statement',
  INVOICE: 'invoice',
  OTHER: 'other',
};

/** Incident statuses, also the options of the `incident_updated` trigger. */
export const INCIDENT_STATUSES = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  CLOSED: 'closed',
};

// Document.category of MyFoncia -> trigger category. Anything else is "other".
const DOCUMENT_CATEGORY_MAP = {
  provisionCalls: DOCUMENT_CATEGORIES.CALL_FOR_FUNDS,
  dueNotice: DOCUMENT_CATEGORIES.CALL_FOR_FUNDS,
  generalAssembly: DOCUMENT_CATEGORIES.MEETING,
  period_generalAssembly: DOCUMENT_CATEGORIES.MEETING,
  councilMeetingReport: DOCUMENT_CATEGORIES.MEETING,
  accountSituation: DOCUMENT_CATEGORIES.STATEMENT,
  statementGeneralExpenses: DOCUMENT_CATEGORIES.STATEMENT,
  expensesRepartition: DOCUMENT_CATEGORIES.STATEMENT,
  propertyExpenseStatement: DOCUMENT_CATEGORIES.STATEMENT,
  tenantStatementOfAccount: DOCUMENT_CATEGORIES.STATEMENT,
  regularization_Rental_Management: DOCUMENT_CATEGORIES.STATEMENT,
  invoices: DOCUMENT_CATEGORIES.INVOICE,
  propertyRepairAccountingInvoices: DOCUMENT_CATEGORIES.INVOICE,
};

// Ticket.status (TicketStatusEnum) -> trigger status. The web app shows
// PROCESSED as "Traitée", in the same green as "Clôturée": the manager is
// done with it, so it is no longer an open request.
const TICKET_STATUS_MAP = {
  OPEN: INCIDENT_STATUSES.OPEN,
  WAITING_FOR_FIRST_CLIENT_RESPONSE: INCIDENT_STATUSES.OPEN,
  WORK_IN_PROGRESS: INCIDENT_STATUSES.IN_PROGRESS,
  PROCESSED: INCIDENT_STATUSES.CLOSED,
  FINISHED: INCIDENT_STATUSES.CLOSED,
  CLOSED: INCIDENT_STATUSES.CLOSED,
  AUTO_CLOSED_NO_CLIENT_RESPONSE: INCIDENT_STATUSES.CLOSED,
  AUTO_CLOSED_NO_MANAGER_ACTION: INCIDENT_STATUSES.CLOSED,
};

/** The nodes of a GraphQL connection (`{ edges: [{ node }] }`), or the list itself. */
export function nodesOf(connection) {
  if (Array.isArray(connection)) {
    return connection;
  }
  return (connection?.edges ?? []).map((edge) => edge?.node).filter(Boolean);
}

/** The first defined, non-empty value among the given dotted paths. */
export function first(object, ...paths) {
  for (const path of paths) {
    let value = object;
    for (const part of path.split('.')) {
      value = value === null || value === undefined ? undefined : value[part];
    }
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
}

/**
 * An amount in euros: a number, a string written the French way
 * ("-1 234,56 €"), or `{ value | amount, currency }`. `null` when unreadable.
 */
export function toAmount(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? round2(value) : null;
  }
  if (typeof value === 'object') {
    return fromAmount(value);
  }
  const text = String(value)
    .replace(/[\s\u00a0\u202f\u20ac]|EUR/gi, '')
    .replace(/[\u2212\u2013]/g, '-');
  // "1.234,56" or "1234,56": the comma is the decimal separator.
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const number = Number(normalized);
  return normalized !== '' && Number.isFinite(number) ? round2(number) : null;
}

/**
 * A MyFoncia `Amount` (`{ value, currency }`) in euros. The API counts in
 * CENTS: the web app itself shows `value / 100` (an integer value only, or
 * nothing). `null` when unreadable.
 */
export function fromAmount(amount) {
  const value = amount?.value;
  return Number.isInteger(value) ? round2(value / 100) : null;
}

/** An ISO date (YYYY-MM-DD) from an ISO string, a French "dd/mm/yyyy" or a timestamp. */
export function toDate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const french = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value).trim());
  if (french) {
    const [, day, month, year] = french;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const date = new Date(typeof value === 'number' ? value : String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Whole days from `today` (YYYY-MM-DD) to `date` (YYYY-MM-DD): negative when past. */
export function daysBetween(today, date) {
  if (!today || !date) {
    return null;
  }
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
  );
}

/** One `accounts` entry. */
export function normalizeAccount(raw) {
  if (!raw || typeof raw !== 'object' || !raw.uuid) {
    return null;
  }
  const building = raw.building ?? raw.buildings?.[0] ?? null;
  const street = building?.address
    ? [building.address.address1, building.address.zipCode, building.address.city]
        .filter(Boolean)
        .join(' ')
    : null;
  return {
    id: String(raw.uuid),
    number: raw.number ? String(raw.number) : null,
    quality: raw.quality ?? null,
    name: String(building?.name || street || `Foncia ${raw.number ?? raw.uuid}`),
    address: street || null,
    role: toRole(raw.quality),
  };
}

/**
 * The `accounting` of an account: the current balance, the next amount due —
 * the earliest debit line whose due date is today or later — and the last
 * payment received — the latest credit line.
 *
 * @param {object} raw `account.accounting`
 * @param {string} today YYYY-MM-DD
 */
export function normalizeAccounting(raw, today) {
  const lines = nodesOf(raw?.lines);
  const dues = lines
    .filter((line) => line.amount?.__typename !== 'Credit')
    .map((line) => ({
      amount: fromAmount(line.amount),
      date: toDate(line.dueDate),
      label: line.label ?? null,
    }))
    .filter((due) => due.date && due.date >= today && due.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const payments = lines
    .filter((line) => line.amount?.__typename === 'Credit')
    .map((line) => ({
      amount: fromAmount(line.amount),
      date: toDate(line.valueDate ?? line.dueDate),
    }))
    .filter((payment) => payment.amount !== null && payment.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  return {
    balance: fromAmount(raw?.currentBalance),
    due: dues[0] ?? null,
    lastPayment: payments[0] ?? null,
  };
}

/** One `documents` node. */
export function normalizeDocument(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) {
    return null;
  }
  const filename = String(raw.originalFilename ?? 'Document');
  return {
    id: String(raw.id),
    // The file name is what the web app shows: drop the extension.
    title: filename.replace(/\.[a-z0-9]{2,5}$/i, ''),
    category: DOCUMENT_CATEGORY_MAP[raw.category] ?? DOCUMENT_CATEGORIES.OTHER,
    date: toDate(raw.createdAt),
  };
}

/** One `tickets` node: a request made to the manager (repair, incident, question…). */
export function normalizeTicket(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) {
    return null;
  }
  const topic = String(raw.category ?? '')
    .replace(/^(CO_OWNER|TENANT|LANDLORD)_/, '')
    .replace(/_/g, ' ')
    .toLowerCase();
  const number = raw.ticketNumber ? `#${raw.ticketNumber}` : '';
  return {
    id: String(raw.id),
    title: [number, topic].filter(Boolean).join(' ') || 'Ticket',
    status: ticketStatus(raw),
    date: toDate(raw.finishedAt ?? raw.createdAt),
  };
}

/** One general assembly (MissionGeneralAssembly). */
export function normalizeMeeting(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) {
    return null;
  }
  return {
    id: String(raw.id),
    title: String(raw.label ?? 'General assembly'),
    date: toDate(raw.officialMeeting?.date),
  };
}

/** Normalize a list, dropping what could not be identified. */
export function normalizeList(list, normalize) {
  return nodesOf(list)
    .map(normalize)
    .filter((entry) => entry !== null);
}

// A finished or cancelled ticket is closed whatever its status says; an
// unknown status is open only while nothing says it ended.
function ticketStatus(raw) {
  if (raw.finishedAt || raw.cancelledAt) {
    return INCIDENT_STATUSES.CLOSED;
  }
  return TICKET_STATUS_MAP[String(raw.status ?? '').toUpperCase()] ?? INCIDENT_STATUSES.OPEN;
}

function toRole(quality) {
  switch (quality) {
    case 'CO_OWNER':
    case 'LANDLORD':
      return ROLES.OWNER;
    case 'TENANT':
      return ROLES.TENANT;
    default:
      return ROLES.UNKNOWN;
  }
}

function round2(number) {
  return Math.round(number * 100) / 100;
}
