# Foncia for Gladys Assistant

External integration for [Gladys Assistant](https://gladysassistant.com) that brings a
**MyFoncia** account (Foncia: co-ownership management and rentals) into Gladys. Built from the
official [JavaScript template](https://github.com/GladysAssistant/integration-template-js) with
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

> **Unofficial.** Foncia publishes no API: the integration signs in and reads the account the way
> the myfoncia.fr web app does. See [Status](#status).

|           |                                                                           |
| --------- | ------------------------------------------------------------------------- |
| Type      | `device`                                                                  |
| Transport | **cloud** (no local network access)                                       |
| Gladys    | 5.3.0 or later                                                            |
| Languages | English, French, German, Spanish                                          |
| User docs | [en](docs/en.md) · [fr](docs/fr.md) · [de](docs/de.md) · [es](docs/es.md) |

## Features

- **One device per MyFoncia account** (read-only, with history): account balance, next amount
  due, days until the due date, open incidents, new documents, days until the general assembly.
- **Scene triggers**: new document (filter by type: call for funds, general assembly, statement,
  invoice, other), incident updated (filter by status), payment due soon (configurable delay),
  general assembly announced. Only what is new fires, and never twice after a restart.
- **Scene actions**: sync now (returns the figures of one account to the next actions), mark the
  documents as seen.
- **Dashboard widget** "Foncia account": live figures, connection, next due date and general
  assembly, latest documents, sync and mark-as-seen buttons.
- **Configuration buttons**: test the connection, sync now.

## Project structure

```
.
├─ index.js                          # SDK bootstrap + event wiring (no MyFoncia logic)
├─ src/
│  ├─ config.js                      # config defaults + normalization
│  ├─ i18n.js                        # en / fr / de / es helpers
│  ├─ foncia/
│  │  ├─ endpoints.js                # every MyFoncia URL and path
│  │  ├─ client.js                   # Okta sign-in (PKCE), token refresh, API reads
│  │  ├─ normalize.js                # tolerant JSON parsing
│  │  ├─ errors.js                   # error codes + user messages
│  │  ├─ store.js                    # what was already seen (/data/foncia-state.json)
│  │  └─ sync.js                     # the sync: devices, states, scene events
│  ├─ devices/account.js             # the account device
│  └─ capabilities/                  # scene triggers, scene actions, widget (Gladys 5.1+)
├─ docs/                             # user documentation (en, fr, de, es)
├─ test/                             # unit tests (`node --test`), no network
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs, /data volume
├─ CHANGELOG.md                      # Keep a Changelog, rolled by the Release workflow
├─ CLAUDE.md                         # project rules for contributors and coding assistants
├─ SECURITY.md                       # how to report a vulnerability privately
└─ .github/                          # CI, Release, build, GitHub releases, Dependabot
```

## Development

```bash
npm install
npm test               # unit tests
npm run lint           # ESLint
npm run format:check   # Prettier
```

Run against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="gladys-foncia" \
LOG_LEVEL=debug \
npm start
```

Check the store admission rules before a release:

```bash
npx github:GladysAssistant/integration-store --skip-image-check .
```

## Workflows

| Workflow                               | When                         | What                                                                       |
| -------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`             | push on `main`, pull request | Prettier, ESLint, tests (Node 22 + 24); store checks + Docker build on PRs |
| `.github/workflows/release.yml`        | Actions → Release            | bump version, roll the changelog, tag, build, GitHub Release, store checks |
| `.github/workflows/build.yml`          | tag `v*`, manual, release    | multi-arch image (amd64 + arm64) to `ghcr.io/prohand/gladys-foncia`        |
| `.github/workflows/github-release.yml` | push on `main`, release      | creates the missing GitHub Releases from `CHANGELOG.md`                    |

To publish: describe the changes under `## [Unreleased]` in `CHANGELOG.md`, then **Actions →
Release → Run workflow** (patch / minor / major). Add the GitHub topic
`gladys-assistant-integration` to the repository so the store indexes it, and turn on **Private
vulnerability reporting** (see [`SECURITY.md`](SECURITY.md)).

## Status

- Sign-in uses Foncia's Okta organization (`foncia.okta-emea.com`, confirmed by its public OpenID
  discovery document) with the standard flow of a single-page app: `authn` → `authorize` (PKCE)
  → `token`, then refresh tokens.
- **To confirm with a real account**: the Okta client id of the MyFoncia web app, the API host and
  the paths in [`src/foncia/endpoints.js`](src/foncia/endpoints.js). The client id and the API URL
  can be set from the "Advanced settings" of the configuration without rebuilding the image (see
  the [documentation](docs/en.md#advanced-settings)). The JSON parsing
  ([`src/foncia/normalize.js`](src/foncia/normalize.js)) accepts the usual French and English
  field names.
- Accounts protected by a second factor (SMS / app) are not supported.

## License

Apache-2.0
