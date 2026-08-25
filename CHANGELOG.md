# Changelog

Notable user-visible changes are recorded here. The project follows semantic prerelease versions while it remains alpha.

## Unreleased

### Added

- Prepared a controlled AIO dedicated-host reverse-proxy preview with validated runtime configuration, proxy-aware secure demo cookies, public-origin redirects, a non-root container image, loopback-only Compose publishing, and a local nginx example.
- Documented the clean handoff and empty data-volume gate so local SQLite, environment files, and secrets are not promoted to AIO.

### Fixed

- Removed the hydrated Agent and historical `inputBag` from submission responses.
- Made born-form creation retry on a colliding SQLite ID instead of overwriting an existing form.
- Refused automatic and explicit demo replacement for databases without canonical mock ownership metadata.
- Rejected malformed URL encoding and non-JSON media types with stable 4xx responses.

### Repository

- Adopted the Apache License 2.0 and synchronized the package SPDX metadata.
- Added cross-platform syntax checking, GitHub Actions CI, dependency update configuration, contribution/security guidance, and structured issue templates.
- Excluded local desktop/editor metadata and generated release artifacts from source packages.
- Kept the preview explicitly outside WordPress/SSO integration and public-product scope; product mode still fails closed without a production identity provider.

## 1.0.0-alpha.1 - 2026-08-24

- Unified the local author workflow around design, draft tryout, publish, formal submission, and submission management.
- Added immutable release labels, capability-based authorization, idempotent submissions, schema v3 migration, and managed demo data boundaries.
