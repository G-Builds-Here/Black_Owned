<!--
surveyed_at: 2026-08-27T02:40:39Z
commit: 5a67ed37776c18bc32c9f8e783cb67e23b6c1641
relevant_paths:
- jest.config.js
- vitest.config.ts
- e2e
- bw-scraper/tests
- .github/workflows
summary: Test toolchains, mock patterns, and how to add tests.
-->

# Test Infrastructure

## Toolchains

1. **Jest** — main web-app unit/component suite.
   - `npm test` runs Jest with `jest.config.js`.
   - `roots: [src/]`, `testMatch` includes `*.spec.ts`, `*.test.ts`, `*.spec.tsx`, `*.test.tsx`.
   - Uses `jsdom`, `ts-jest`, root `jest.setup.ts`, `__mocks__/next-server.ts`, and `__mocks__/style-mock.js`.
   - Excludes integration/testcontainers/DB-backed specs via `testPathIgnorePatterns`.
2. **Playwright** — E2E suite in `e2e/`.
   - `npx playwright test` or target a file/project.
   - `playwright.config.ts` starts `npm run dev` unless an existing server is reused.
   - Shared helpers in `e2e/e2e-utils.ts` use direct `psql`, session seeding, route warming, and cleanup.
3. **Cargo test** — Rust tests.
   - `cargo test` for workspace.
   - `cargo test -p bw_scraper` for the active scraper crate.
   - Inline `#[cfg(test)]` modules plus `tests/` integration files.
   - Some valid-URL connector tests require live local Postgres/NATS/Valkey/ClickHouse.
4. **Vitest** — configured but not installed.
   - `vitest.config.ts` + `vitest.setup.ts` exist, but `vitest` is not in `devDependencies`.
   - `src/app/performance.test.ts` imports Vitest and therefore cannot run.
5. **CI** — Rust-only.
   - `ci.yml`: `cargo check`, `cargo test`, clippy, coverage, with GitHub Postgres/NATS/Valkey services.
   - `bw-scraper-ci.yml`: lint/test/coverage for `bw_scraper`, Docker build, `cargo audit`; excludes non-compiling `bw-api`.

## Mock Patterns

- API route specs colocate next to routes: `src/app/api/<name>/route.spec.ts`.
- Common mocks:
  - `jest.mock('@/lib/db/user-repository', () => ({ getPool: jest.fn() }))`
  - `jest.mock('@/lib/auth/jwt-middleware', () => ({ createAuthMiddleware: jest.fn(), createAuthErrorResponse: jest.fn() }))`
  - `jest.mock('next/navigation')` for components.
  - `jest.mock('@/lib/auth/client-session')` for client session behavior.
- Requests are often plain objects cast to `Request` because routes usually call `request.json()`.
- Component specs use `@testing-library/react`, usually organized by state: Loading, Error, Not Found, Success.

## How To Add A Test

- **New REST route**: create `src/app/api/<name>/route.spec.ts` beside the route.
  - Mock `getPool` and auth middleware.
  - Define `AUTH_OK` / `AUTH_FAIL` fixtures.
  - Test 401/403, validation 400, happy path, and external/DB failure cases.
- **New component**: create `src/components/<Name>.spec.tsx` beside the component.
  - Mock navigation/session/auth as needed.
  - Assert with `screen.getBy*`, `waitFor`, and state-based describe blocks.
- **New Rust unit test**: add `#[cfg(test)] mod tests` inside the file for pure logic.
- **New Rust integration test**: add `tests/<name>_test.rs`; if it needs live services, document required env vars and defaults.
- **New E2E test**: add `e2e/<feature>.spec.ts` and reuse `e2e-utils.ts`.

## Known Test Risks

- `npm test` green does not prove integration behavior: DB-backed and testcontainers suites are excluded.
- Jest component config is not wired to an npm script and references a missing `__mocks__/file-mock.js`.
- Multiple unreferenced setup files exist: root `jest.setup.js`, `src/jest.setup.ts`, and active root `jest.setup.ts`.
- Root-level Valkey/ClickHouse/test-environment specs are not picked up by Jest because `roots` is `src/`.
- `.worktrees/epic-jest/` contains stale duplicate test infrastructure.
