# Security policy

## Supported versions

Form Studio is currently an alpha project. Only the latest commit on the default branch and the latest tagged alpha receive security fixes.

## Reporting a vulnerability

After the repository enables GitHub private vulnerability reporting, use **Security → Report a vulnerability**. Do not open a public issue for suspected authorization bypass, cross-owner submission disclosure, credential exposure, destructive migration, or stored/browser injection.

Include the affected commit/version, product mode, exact route or file, minimal reproduction, impact, and whether real identities or form answers were involved. Redact tokens, cookies, private answers, local paths, and database contents. Maintainers should acknowledge the report privately before discussing disclosure timing.

If private reporting is not yet enabled, do not publish exploit details; contact the repository owner through a verified private channel first.

## Deployment boundary

The included server binds to `127.0.0.1`. Demo identities and canonical mock data are for local evaluation only. Product mode intentionally fails closed until a real identity provider is supplied. Exposing the process through a reverse proxy, shared host, or public network requires separate authentication, TLS, backup/restore, rate-limit, audit-log, and deployment review.
