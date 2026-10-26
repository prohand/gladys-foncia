# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- First version of the Foncia integration: sign-in with the settings of the
  MyFoncia web app (my-foncia.fonciamillenium.net: Okta, PKCE, refresh token),
  account read through its GraphQL API, one Gladys device per account with its
  balance, next amount due, days until the due date, open requests to Foncia,
  new documents and days until the general assembly.
- Scene triggers: new document (filtered by type), request updated (filtered by
  status), payment due soon, general assembly announced. Only what is new fires,
  and the memory of what was seen survives a restart (`/data/foncia-state.json`).
- Scene actions: sync now (with the figures of one account as outputs) and mark
  the documents as seen.
- "Foncia account" dashboard widget: balance, amount due (0 € when nothing is
  due), last payment and new documents, connection status, next due date and
  general assembly, latest documents, sync and mark-as-seen buttons. A dash
  replaces a figure only when MyFoncia could not be read.
- Configuration buttons: test the connection, sync now.
- Every text in English, French, German and Spanish, user documentation in the
  four languages.
- Cloud transport badge on every account device.
- CI (Prettier, ESLint, tests on Node 22 and 24, store checks, Docker build),
  UI-driven Release workflow, GitHub Releases and Dependabot.
- `SECURITY.md` and `CLAUDE.md`.

### Fixed

- Requests shown as "Traitée" or "Clôturée" on MyFoncia, or finished or
  cancelled, no longer count as open.
- A document space MyFoncia refuses no longer hides the documents of the others.

[Unreleased]: https://github.com/prohand/gladys-foncia/commits/main
