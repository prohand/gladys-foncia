// -----------------------------------------------------------------------------
// The GraphQL operations the integration sends to MyFoncia.
//
// They are trimmed copies of the ones the MyFoncia web app sends (same
// operation names, same arguments): only the fields the integration reads are
// asked for. Keep the operation names: they show up as such in Foncia's logs,
// next to the web app's own.
// -----------------------------------------------------------------------------

const BUILDING = `
  id
  name
  address {
    address1
    zipCode
    city
  }
`;

export const ACCOUNTS = `
query getBasicAccounts($itemsPerPage: Int, $pageNumber: Int) {
  accounts(itemsPerPage: $itemsPerPage, pageNumber: $pageNumber) {
    uuid
    number
    quality
    ... on CoownerAccount {
      building {${BUILDING}}
    }
    ... on TenantAccount {
      building {${BUILDING}}
    }
    ... on LandlordAccount {
      buildings {${BUILDING}}
    }
  }
}`;

export const ACCOUNTING = `
query getDashboardAccountingBalance($uuid: EncodedID!, $first: Int) {
  account(uuid: $uuid) {
    uuid
    accounting {
      currentBalance {
        value
        currency
      }
      lines(first: $first) {
        edges {
          node {
            id
            label
            valueDate
            dueDate
            amount {
              __typename
              ... on Debit {
                value
                currency
              }
              ... on Credit {
                value
                currency
              }
            }
          }
        }
      }
    }
  }
}`;

export const DOCUMENTS = `
query getAccountDocuments($accountUuid: EncodedID!, $first: Int, $customerPortalCategory: CustomerPortalFileCategoryEnum!) {
  account(uuid: $accountUuid) {
    uuid
    documents(first: $first, customerPortalCategory: $customerPortalCategory) {
      totalCount
      edges {
        node {
          id
          originalFilename
          category
          createdAt
        }
      }
    }
  }
}`;

export const TICKETS = `
query getTickets($accountUuid: EncodedID!, $first: Int, $status: [TicketStatusEnum!]) {
  tickets(accountUuid: $accountUuid, first: $first, status: $status) {
    totalCount
    edges {
      node {
        id
        category
        ticketNumber
        status
        createdAt
        finishedAt
      }
    }
  }
}`;

export const GENERAL_ASSEMBLIES = `
query getGeneralAssemblies($accountUuid: EncodedID!) {
  account(uuid: $accountUuid) {
    uuid
    ... on CoownerAccount {
      nextGeneralAssembly {
        id
        label
        status
        officialMeeting {
          date
        }
      }
      nextGeneralAssemblies {
        id
        label
        status
        officialMeeting {
          date
        }
      }
    }
  }
}`;

// Every ticket status the web app lists (TicketStatusEnum).
export const TICKET_STATUSES = [
  'OPEN',
  'WORK_IN_PROGRESS',
  'WAITING_FOR_FIRST_CLIENT_RESPONSE',
  'PROCESSED',
  'FINISHED',
  'CLOSED',
];

// Account qualities (Account.quality).
export const QUALITIES = { CO_OWNER: 'CO_OWNER', TENANT: 'TENANT', LANDLORD: 'LANDLORD' };

// The document spaces (CustomerPortalFileCategoryEnum) each quality reads:
// the customer's own documents, plus those of the building for a co-owner.
export const DOCUMENT_SPACES = {
  [QUALITIES.CO_OWNER]: ['CO_OWNER', 'BUILDING'],
  [QUALITIES.TENANT]: ['TENANT'],
  [QUALITIES.LANDLORD]: ['RENTAL_MANAGEMENT_MANDATE'],
};
