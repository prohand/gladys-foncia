# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors working on
this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **MyFoncia**, the customer area of Foncia
(French property manager: co-ownership and rentals). It signs in with the user's e-mail and
password, reads every account, and exposes one read-only Gladys device per account (balance,
amount due, days until due, open incidents, new documents, days until the general assembly).
Requires Gladys 5.3+. Cloud only (`transports: ["cloud"]`). Scene triggers (new document, incident
updated, payment due, general assembly announced), scene actions (sync now, mark documents seen)
and a "Foncia account" widget.

**Foncia publishes no API.** Everything is taken from the MyFoncia web app
(`https://my-foncia.fonciamillenium.net/config.js` and its GraphQL operations): Okta sign-in on
`login.my-foncia.fonciamillenium.net` (authorization server `millenium`, the web app's client id),
then GraphQL on `customer-portal-gateway.prod.fonciamillenium.net/graphql`. Addresses live in
`src/foncia/endpoints.js`, operations in `src/foncia/queries.js` (trimmed copies of the web app's,
same operation names). The client id and the API URL can be overridden from the "Advanced
settings" of the configuration.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/sync.test.js               # one file
node --test --test-name-pattern "payment"   # one test by name
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store --skip-image-check .   # store admission checks
```

CI runs `format:check`, `lint`, `test` (Node 22 and 24), plus the store checks and a Docker build
on pull requests. Releases: **Actions → Release** only (bumps `package.json`, manifest `version` +
`docker_image`, rolls `CHANGELOG.md`, re-runs Prettier, tags, builds, publishes the GitHub
Release).

## Architecture

```
index.js                    SDK wiring only: handlers registered before connect()
src/config.js               DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js                 LANGUAGES (en, fr, de, es) + pick / localize
src/foncia/endpoints.js     every MyFoncia address (the one place to fix when Foncia moves)
src/foncia/queries.js       the GraphQL operations (copies of the web app's)
src/foncia/client.js        Okta sign-in (authn -> authorize + PKCE -> token), refresh, GraphQL
src/foncia/normalize.js     tolerant GraphQL -> account / accounting / document / ticket / meeting
src/foncia/errors.js        FonciaError codes + their message in the four languages
src/foncia/store.js         memory of what was already seen, /data/foncia-state.json
src/foncia/sync.js          analyzeAccount (pure diff -> snapshot + events) + the sync service
src/devices/account.js      the account device: discovery payload and states
src/capabilities/           triggers.js, scenes.js, widget.js (Gladys 5.1 capabilities)
docs/{en,fr,de,es}.md       user documentation, re-hosted by Gladys (en and fr mandatory)
test/                       node --test, SDK fake Gladys + test/helpers/fakeFoncia.js; no network
```

### Invariants worth knowing

- **Nothing is polled by Gladys.** The service runs its own timer (`sync_interval`, minutes,
  15 minimum) and pushes states with `publishChangedStates` (daily heartbeat). Account devices
  carry no `poll_frequency`.
- **Triggers fire for what is new only.** The first sync of an account learns and fires nothing;
  the memory is saved BEFORE the events are published (a crash loses an event rather than firing
  it twice); at most `MAX_EVENTS_PER_KIND` events of each kind per account and sync.
- **One list failing does not stop the sync** (a tenant has no general assembly): only network
  and credential errors abort it.
- **External ids are forever**: `gladys.externalIds('account', <MyFoncia account id>)`, feature
  keys in `FEATURES`. Never rename them, nor any manifest key users store (config, actions,
  trigger / action / widget keys, select option values).
- **Secrets**: the password and the tokens are never logged, never written to disk, never put in
  an error message (`test/client.test.js` checks it).
- **The container rootfs is read-only**: write only under `/data`.
- **Every feature declares `min`/`max`** (NOT NULL in Gladys).

### Manifest

`test/manifest.test.js` keeps `gladys-assistant-integration.json` in sync with the code: handlers
of every action / scene action / widget, triggers fired = triggers declared, defaults =
`DEFAULT_CONFIG`, every text in en/fr/de/es, store length limits, categories vocabulary,
`keywords` rules, `gladys_version >=5.3.0`, `transports: ["cloud"]`, version = `package.json`.

## Rules

- **Versions belong to the Release workflow.** Never edit `version` in `package.json` or the
  manifest, nor the `docker_image` tag, by hand.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md`
  (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version heading.
- **User-facing text** is `{ en, fr, de, es }`: manifest texts, action and widget messages,
  connection statuses, and `docs/*.md`, kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English. Tests
  never touch the network.
