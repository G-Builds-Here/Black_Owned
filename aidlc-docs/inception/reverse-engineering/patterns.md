<!--
surveyed_at: 2026-08-27T02:40:39Z
commit: 5a67ed37776c18bc32c9f8e783cb67e23b6c1641
relevant_paths:
- src/lib
- src/app/api
- bw-scraper/src
summary: Established code patterns and their rationale.
-->

# Patterns

## Auth

- JWT RS256 asymmetric signing (`JWT_ALGORITHM = "RS256"`, keys in `config/jwt`, `jsonwebtoken` in TS and Rust bw-api). Access + refresh token pairs; refresh tokens persisted in Valkey so they can be revoked and survive restarts.
- `createAuthMiddleware(requiredRoles?)` wraps route handlers: 401 on missing/invalid/expired, 403 on insufficient role. Default role requirement: `user` (i.e. any authenticated role).
- Exception: `PATCH /api/users` (role change) does manual token verification instead of the shared middleware — inconsistent, but deliberate per its 401/403 split.

## Response Envelope

- REST routes return `{ success, data, code }` — `success: boolean`, `data` payload, machine-readable `code` (e.g. `VALIDATION_ERROR`, `NOT_FOUND`, `INVALID_STATUS`). Error shapes use `createAuthErrorResponse` for auth failures.
- GraphQL-style envelope `{data}`/`{errors}` at `/api/graphql`.

## Data Access

- Repository-per-table modules in `src/lib/db/`; single module-level pg `Pool` via `getPool()` (max 20, connectionTimeoutMillis 2000, lazy — no connection at import, fails on first query).
- Unit specs mock the `user-repository` module's `getPool` so no Pool is ever constructed under jest.

## Testing

- Colocation: `*.spec.ts` / `*.spec.tsx` sit next to source (route.spec.ts next to route.ts).
- Behavior-first `it()` sentences ("returns 401 when the request is not authenticated"), `it.each` for parameterized cases.
- Mock at the repository layer (getPool → mockPool → mockClient with `query`) and at the auth layer (createAuthMiddleware → AUTH_OK/AUTH_FAIL fixtures); requests are plain objects cast to `Request` (jest.setup.ts polyfills missing Web APIs).
- `next/server` mapped to a hand-rolled `__mocks__/next-server.ts`.
- Component specs: @testing-library/react with state-based describe blocks (Loading / Error / Not Found / Success).

## Migrations

- Numeric-prefix SQL files, applied in order, one file per transaction, tracked in `schema_migrations`; re-runs no-op (idempotent content). 001 is the reconciled baseline; 009 guards live-DB drift. Deliberate gaps (003/005/006/008 deleted) documented in-file.

## Config / Env

- `.env` at repo root is the single host-side source; docker-compose interpolates it for container-scoped URLs. App falls back to `POSTGRES_*` component vars when `DATABASE_URL` is unset.
- Rust: `Config::from_env()` in bw-scraper/src/config.rs — `DATABASE_URL` required (fail-fast exit), everything else optional with hardcoded defaults.

## UI

- Tailwind CSS v4 design tokens; `ui/` primitives (Button, Card, Badge, Input, Modal, Table) composed into `admin/` and `business/` components.

## Rust Conventions

- axum handlers, `Config::from_env`, sqlx `PgPool`, inline `#[cfg(test)]` mods per module, `tests/` for integration (connectors_test.rs needs live services — documented).

## Repo-Documented Drift

- `docs/design-drift-audit-2026-08-20.md` — the repo ships its own drift audit; several HIGH items (chat, admin auth gates, dedup wiring, port 9000 collision, migration baseline) were subsequently fixed and the audit logs the fixes.
