// -----------------------------------------------------------------------------
// From MyFoncia JSON to the few shapes the integration works with.
//
// The API is undocumented and its field names are French in some places,
// English in others, nested in some answers and flat in others. Every read goes
// through here, tolerant by design: a field found under one of its known names
// is used, a field missing is `null`, and an entry the integration cannot even
// identify is dropped — never a crash that would stop the whole sync.
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

/**
 * The list an answer carries: the answer itself, or the first array found
 * under one of the usual wrappers (`items`, `data`, `results`…).
 */
export function listOf(payload, ...names) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  for (const name of [...names, 'items', 'data', 'results', 'content', 'list']) {
    const value = payload[name];
    if (Array.isArray(value)) {
      return value;
    }
    // `{ data: { items: [...] } }`
    if (value && typeof value === 'object') {
      const nested = listOf(value, ...names);
      if (nested.length > 0) {
        return nested;
      }
    }
  }
  return [];
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
 * ("-1 234,56 €"), or `{ amount | value, currency }`. `null` when unreadable.
 */
export function toAmount(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? round2(value) : null;
  }
  if (typeof value === 'object') {
    return toAmount(first(value, 'amount', 'value', 'montant'));
  }
  const text = String(value)
    .replace(/[\s\u00a0\u202f\u20ac]|EUR/gi, '')
    .replace(/[\u2212\u2013]/g, '-');
  // "1.234,56" or "1234,56": the comma is the decimal separator.
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const number = Number(normalized);
  return normalized !== '' && Number.isFinite(number) ? round2(number) : null;
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

export function normalizeAccount(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const id = first(raw, 'id', 'accountId', 'account_id', 'uuid', 'reference', 'numero');
  if (id === null) {
    return null;
  }
  const address = first(
    raw,
    'address.label',
    'address.fullAddress',
    'adresse.libelle',
    'building.address',
    'address',
    'adresse',
  );
  const name = first(raw, 'label', 'name', 'title', 'libelle', 'building.name', 'lot.label');
  return {
    id: String(id),
    name: String(name ?? (typeof address === 'string' ? address : `Foncia ${id}`)),
    address: typeof address === 'string' ? address : null,
    role: toRole(first(raw, 'role', 'type', 'profile', 'accountType', 'typeCompte')),
    balance: toAmount(first(raw, 'balance', 'solde', 'accountBalance', 'soldeCompte')),
  };
}

export function normalizeSummary(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const due = first(source, 'nextPayment', 'nextDue', 'prochainAppel', 'nextCallForFunds', 'due');
  const meeting = first(source, 'nextMeeting', 'nextGeneralAssembly', 'prochaineAG');
  return {
    balance: toAmount(first(source, 'balance', 'solde', 'accountBalance', 'soldeCompte')),
    due: due
      ? {
          amount: toAmount(first(due, 'amount', 'montant', 'value') ?? due),
          date: toDate(first(due, 'dueDate', 'date', 'dateEcheance', 'echeance')),
        }
      : null,
    nextMeetingDate: meeting ? toDate(first(meeting, 'date', 'startDate') ?? meeting) : null,
  };
}

export function normalizeDocument(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const id = first(raw, 'id', 'documentId', 'uuid', 'reference');
  if (id === null) {
    return null;
  }
  const title = String(first(raw, 'title', 'label', 'name', 'libelle', 'fileName') ?? 'Document');
  const kind = first(raw, 'category', 'type', 'documentType', 'typeDocument', 'nature');
  return {
    id: String(id),
    title,
    category: toDocumentCategory(`${kind ?? ''} ${title}`),
    date: toDate(first(raw, 'date', 'publicationDate', 'createdAt', 'datePublication')),
  };
}

export function normalizeIncident(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const id = first(raw, 'id', 'incidentId', 'uuid', 'reference', 'numero');
  if (id === null) {
    return null;
  }
  return {
    id: String(id),
    title: String(first(raw, 'title', 'label', 'subject', 'libelle', 'description') ?? 'Incident'),
    status: toIncidentStatus(first(raw, 'status', 'statut', 'state', 'etat')),
    date: toDate(first(raw, 'updatedAt', 'date', 'createdAt', 'dateCreation')),
  };
}

export function normalizeMeeting(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const date = toDate(first(raw, 'date', 'startDate', 'meetingDate', 'dateAG'));
  const id = first(raw, 'id', 'meetingId', 'uuid', 'reference') ?? date;
  if (id === null) {
    return null;
  }
  return {
    id: String(id),
    title: String(first(raw, 'title', 'label', 'type', 'libelle') ?? 'General assembly'),
    date,
  };
}

/** Normalize a list, dropping what could not be identified. */
export function normalizeList(payload, normalize, ...names) {
  return listOf(payload, ...names)
    .map(normalize)
    .filter((entry) => entry !== null);
}

function toRole(value) {
  const text = String(value ?? '').toLowerCase();
  if (/locat|tenant|renter/.test(text)) {
    return ROLES.TENANT;
  }
  if (/propri|owner|copro|bailleur|landlord/.test(text)) {
    return ROLES.OWNER;
  }
  return ROLES.UNKNOWN;
}

function toDocumentCategory(text) {
  const value = text.toLowerCase();
  if (/appel|fund|call/.test(value)) {
    return DOCUMENT_CATEGORIES.CALL_FOR_FUNDS;
  }
  if (/\bag\b|assembl|convoc|proc[eè]s|minutes|meeting/.test(value)) {
    return DOCUMENT_CATEGORIES.MEETING;
  }
  if (/relev|statement|d[ée]compte|r[ée]gul|charges/.test(value)) {
    return DOCUMENT_CATEGORIES.STATEMENT;
  }
  if (/factur|invoice|quittance|receipt|avis d'[ée]ch[ée]ance/.test(value)) {
    return DOCUMENT_CATEGORIES.INVOICE;
  }
  return DOCUMENT_CATEGORIES.OTHER;
}

function toIncidentStatus(value) {
  const text = String(value ?? '').toLowerCase();
  if (/clos|clotur|cl[ôo]tur|termin|r[ée]solu|resolved|done|closed|finish|complet/.test(text)) {
    return INCIDENT_STATUSES.CLOSED;
  }
  if (/cours|progress|planif|schedul|assign|pris en charge|intervention/.test(text)) {
    return INCIDENT_STATUSES.IN_PROGRESS;
  }
  return INCIDENT_STATUSES.OPEN;
}

function round2(number) {
  return Math.round(number * 100) / 100;
}
