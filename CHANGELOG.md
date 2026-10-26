# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- First version of the Foncia integration: sign-in to MyFoncia (Okta, PKCE,
  refresh token), one Gladys device per account with its balance, next amount
  due, days until the due date, open incidents, new documents and days until
  the general assembly.
- Scene triggers: new document (filtered by type), incident updated (filtered by
  status), payment due soon, general assembly announced. Only what is new fires,
  and the memory of what was seen survives a restart (`/data/foncia-state.json`).
- Scene actions: sync now (with the figures of one account as outputs) and mark
  the documents as seen.
- "Foncia account" dashboard widget: live figures, connection status, next due
  date and general assembly, latest documents, sync and mark-as-seen buttons.
- Configuration buttons: test the connection, sync now.
- Every text in English, French, German and Spanish, user documentation in the
  four languages.
- Cloud transport badge on every account device.
- CI (Prettier, ESLint, tests on Node 22 and 24, store checks, Docker build),
  UI-driven Release workflow, GitHub Releases and Dependabot.
- `SECURITY.md` and `CLAUDE.md`.

[Unreleased]: https://github.com/prohand/gladys-foncia/commits/main
