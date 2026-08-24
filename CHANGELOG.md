# Changelog

Notable user-visible changes are recorded here. The project follows semantic prerelease versions while it remains alpha.

## Unreleased

### Fixed

- Removed the hydrated Agent and historical `inputBag` from submission responses.
- Made born-form creation retry on a colliding SQLite ID instead of overwriting an existing form.
- Refused automatic and explicit demo replacement for databases without canonical mock ownership metadata.
- Rejected malformed URL encoding and non-JSON media types with stable 4xx responses.

### Repository

- Adopted the Apache License 2.0 and synchronized the package SPDX metadata.
- Added cross-platform syntax checking, GitHub Actions CI, dependency update configuration, contribution/security guidance, and structured issue templates.
- Excluded local desktop/editor metadata and generated release artifacts from source packages.

## 1.0.0-alpha.1 - 2026-08-24

- Unified the local author workflow around design, draft tryout, publish, formal submission, and submission management.
- Added immutable release labels, capability-based authorization, idempotent submissions, schema v3 migration, and managed demo data boundaries.
