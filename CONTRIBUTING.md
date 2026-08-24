# Contributing to Form Studio

Thank you for helping improve Form Studio. The project favors small, evidence-backed changes that preserve its published-form and submission boundaries.

## Before changing code

1. Read [`DESIGN.md`](./DESIGN.md), the product truth source.
2. Read [`docs/architecture.md`](./docs/architecture.md) and [`docs/testing.md`](./docs/testing.md).
3. Search existing issues and explain the user-visible problem before proposing a new abstraction.

Do not treat the local demo as proof of a real Poffices integration. Preserve `ownerAgent`, immutable published definitions, original submission envelopes, capability checks, and the distinction between logical `inputBag` and physical submission records.

## Local setup

Requirements: Node.js 22.13+ or 24.x LTS and npm with lockfile support.

```bash
npm ci
npx playwright install chromium
npm run check
```

Playwright uses port 4191 by default. If another process owns it, choose an isolated port:

```powershell
$env:FORM_STUDIO_TEST_PORT = "43191"
npm run check
```

```bash
FORM_STUDIO_TEST_PORT=43191 npm run check
```

Use `npm run demo` only with disposable canonical mock data. Product mode does not install a demo identity provider.

## Tests and pull requests

- Put contract, runtime, and browser tests in their existing categories.
- Add a regression test at the lowest layer that can prove the repaired invariant.
- Run `npm run check` and `git diff --check` before opening a pull request.
- Keep generated screenshots, SQLite files/backups, logs, `.learnings`, `test-results`, and editor metadata out of commits.
- Report vulnerabilities privately according to [`SECURITY.md`](./SECURITY.md), never in a public issue.

By submitting a contribution for inclusion in Form Studio, you agree that it is provided under the repository's [Apache License 2.0](./LICENSE), unless a separate written agreement applies. Only submit work that you have the right to license.
