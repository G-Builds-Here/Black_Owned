<!--
surveyed_at: 2026-09-05T19:45:00Z
commit: 1d809d37d45d649844f979496e7d7ea1d47a40ce
relevant_paths:
  - src/app/api
  - src/lib
  - bw-scraper/src
  - docker-compose.yml
  - .env.example
summary: Survey findings — violations, recommendations, tech debt, gotchas, and cross-cutting connections.
-->

# Survey Findings

## Violations

### 1. GraphQL route bypasses authentication entirely
**Project:** root (Next.js)
**Severity:** HIGH
`POST /api/graphql` performs no JWT verification, and the `createBusiness` mutation
resolver is invoked with a fabricated `Authorization: Bearer token` context
(`src/app/api/graphql/route.ts`). Any anonymous caller can create businesses through
the GraphQL surface while every REST equivalent requires auth.
**Operational Impact:** Unauthenticated business creation; directory data integrity
and verification pipeline are open to abuse (spam listings, fake claims) the moment
this route is reachable.
**Mitigation Sketch:** Wire the route through `createAuthMiddleware` like the REST
routes, pass the real request headers into the resolver context, and delete the
hardcoded token. Until then, consider restricting `/api/graphql` to a dev-only mount.

### 2. bw-scraper mutating endpoints are unauthenticated and port-published
**Project:** bw-scraper (Rust axum service)
**Severity:** HIGH
`POST /scrape`, `POST /enrich`, `POST /locations` carry no auth, and docker-compose
publishes `8080` to the host. Only `/enrich` is fronted by the admin-gated
`/api/admin/enrichment` proxy; `/scrape` and `/locations` have no gate at all.
**Operational Impact:** Anyone who can reach :8080 can trigger scrapes, mutate
`businesses` rows (enrichment overwrites product data), and write location rows —
with no audit trail tied to a user.
**Mitigation Sketch:** Add a shared-secret header (e.g. `X-Worker-Token`) checked by a
middleware layer on all mutating routes, and un-publish the port from the host (or
bind to the compose network only). Keep the admin proxy as the product-facing seam.

### 3. Cross-language field-name drift silently widens enrichment scope
**Project:** root (Next.js) → bw-scraper (Rust)
**Severity:** MEDIUM
The TS proxy forwards `{ limit?, businessIds? }` camelCase; bw-scraper's
`EnrichRequest` deserializes `business_ids` (snake_case). Serde silently drops the
unknown camelCase key, so a targeted "enrich these N businesses" call degrades to an
unfiltered full-table enrichment run.
**Operational Impact:** Admin "enrich selected" actions actually enrich up to
`limit` arbitrary businesses — wasted SearXNG/Nominatim quota, rate-limit pressure,
and unexpected writes to rows the admin did not select.
**Mitigation Sketch:** Add `#[serde(alias = "businessIds")]` to the Rust field (or
rename the TS payload to snake_case) and add a regression test that asserts a
targeted request touches only the requested ids.

## Recommendations

### 4. Push directory filtering/pagination into SQL
**Project:** root (Next.js)
`GET /api/directory` and `/api/directory/suggest` load the entire directory into
memory and filter/sort/page in JS (`src/app/api/directory/route.ts`,
`suggest/route.ts`). This is a performance optimisation, not a requirement —
correctness does not depend on it — but cost grows linearly with directory size and
`/suggest` pays the full load on every autocomplete keystroke. Move search/category/
rating filters and LIMIT into SQL; give suggest a dedicated
`SELECT DISTINCT name … WHERE name ILIKE $1 LIMIT 5`.

### 5. Use or remove the declared GraphQL dependencies
**Project:** root (Next.js)
`graphql` and `@graphql-tools/schema` are in `package.json` but never imported; the
route uses a regex parser over raw query strings. Either wire a real executor
(preferable — it fixes finding 1's auth story) or drop the deps so the manifest
matches reality.

### 6. Re-verify the bw-api CI exclusion
**Project:** bw-api (Rust)
`bw-scraper-ci.yml` excludes bw-api from coverage "until its pre-existing compile
errors are fixed (task #71)", but `cargo check -p bw-api --all-targets` passes today
(5 warnings that would fail CI clippy `-D warnings`). The exclusion comment is stale;
fix the warnings and re-include it, or drop the crate (see #8).

## Tech Debt

### 7. `POST /api/scrape-jobs` inserts queue rows no worker consumes
**Project:** root (Next.js)
The endpoint inserts a `scrape_jobs` row with status `pending` and runs the
in-process TS scrapers; nothing ever polls the queue (bw-scraper has its own
standalone `POST /scrape` and does not read the table). The queue semantics are
decorative, and the TS executor's status vocabulary (`'scraping'`) does not match
the Postgres CHECK values (`'running'`).

### 8. Dormant Rust crates: bw-api and bw-ingestion
**Project:** bw-api, bw-ingestion (Rust)
Neither is run by any compose service or binary. bw-ingestion defines NATS
consumers (`chat.message`, `email.send`, `image.process`) that nothing hosts, a
second `cache.invalidate` consumer duplicating the TS one, and pins drifted crate
versions (async-nats 0.40, redis 0.27, axum 0.8 in bw-api vs 0.7/0.33/0.24 in
bw-scraper). bw-scraper's `enrichment.rs` is a 215 KB single module.
Decision needed: reactivate, delete, or quarantine with a documented rationale.

### 9. Root-level Vitest configuration with no Vitest install
**Project:** root (Next.js)
`vitest.config.ts` + `vitest.setup.ts` are tracked, `src/app/performance.test.ts`
imports vitest, and `clickhouse/*.test.ts` (LOC-0032) are excluded from Jest — none
can run from root. The only working vitest is `packages/ui` (not a workspace
member). Either install vitest at root, move the config, or delete the root
artifacts and relocate the tests.

### 10. Dead/unused symbols
**Project:** root (Next.js)
- `graphql`, `@graphql-tools/schema` — declared, never imported (see #5).
- `PATCH_STATUS` export in the users route — unreachable (App Router wires `PATCH`
  only).
- ClickHouse mirror table (`migrations/clickhouse/001`) has no runtime write path
  in the active code.

## Gotchas

### 11. MinIO host port is 9002, not 9000
**Project:** root
Compose publishes MinIO on host **9002** (9000 is ClickHouse), but the app default
is `MINIO_PORT=9000`. Host-side presigned URLs require `MINIO_PORT=9002` in `.env`,
or uploads break with confusing connection errors.

### 12. Playwright `reuseExistingServer: true` silently serves stale code
**Project:** root
A long-lived `next dev` (e.g. left running from a worktree) is reused for E2E runs
and may be serving old code. Kill/restart the dev server when results look wrong.

### 13. CI sets `VALKEY_URL`; the connector tests read `REDIS_URL`
**Project:** bw-scraper (Rust)
The CI workflow exports `VALKEY_URL` for the Valkey service, but
`tests/connectors_test.rs` reads `REDIS_URL` (falling back to localhost), and the
CI test job provides no ClickHouse service — so "connectivity" tests pass with
every service down (they only assert the health message is non-empty). CI green
does not prove service connectivity.

### 14. `SEARXNG_URL` defaults to a developer LAN IP
**Project:** bw-scraper (Rust)
The config default is `http://192.168.68.50:8888`. Any environment without an
explicit `SEARXNG_URL` override points discovery at one machine's LAN.

### 15. E2E helpers require the Docker CLI
**Project:** root (e2e)
`e2e-utils.ts` seeds/teardowns via `docker exec black-owned-postgres psql`
(`execSync`). E2E cannot run where the Docker CLI is absent or the container name
differs (the pinned `black_owned` compose project name is what keeps this working).

### 16. Survey tooling is .NET-shaped for this polyglot repo
**Project:** survey infrastructure (`~/.claude/tools/`)
`pre-scan.py` and `c4-extract.py` are built around .NET concepts: the pre-scan
schema carries `cs_files`, `class_inventory`, `using_namespaces`, and
`newtonsoft`/`system_text_json` fields that are vacuous here, and it detected
only the npm project (0 endpoints, 0 config files, 0 env-var reads, 0 static
state). The Rust counterpart `pre-scan-rust.py` exists in the toolset but is not
wired into `survey-prep.py` and is not mentioned in `luke-survey.md`, so S2 of
this survey had to run it manually. `c4-extract.py` also emitted a placeholder
system name ("bo survey"), boilerplate C2 descriptions, and C3 relationships
labeled "Method call". Mitigated in this survey: `survey_tmp/pre-scan-rust.json`
generated (Cargo projects, env-var reads, test groups, static state for all 4
crates), and `c4-skeleton.json` corrected by hand (system name, C1 actors/
externals, C2 descriptions, TypeScript C3 components, SearXNG/Nominatim externals)
before re-rendering `c4.html`.
**Recommendation:** wire `pre-scan-rust` into `survey-prep` for polyglot repos
and add a polyglot pass to `c4-extract` (repo-name resolution, TS component
extraction, language-neutral relationship labels).

## Cross-Cutting Connections

- **Dual-writer Postgres + TS-only cache invalidation**: bw-scraper writes
  `businesses`/`business_locations` without publishing `cache.invalidate`, so the
  Valkey query cache (invalidated only by the TS NATS subscriber) can serve stale
  rows after enrichment — findings #2/#3 and the caching pattern in `patterns.md`
  compound.
- **Enrichment boundary drift**: the camelCase→snake_case gap (#3) plus the missing
  auth (#2) make the single HTTP seam between the two languages the weakest part of
  the pipeline.
- **Hollow CI signal** (#13): because Rust "connectivity" tests assert nothing
  real, the only CI-verified layer is compilation + unit tests; integration
  regressions in the Rust worker reach prod without a CI tripwire.
- **Dormant crates vs. in-process TS handling** (#8): bw-ingestion's consumers were
  superseded by in-process TS equivalents; leaving both in the tree invites
  "which one handles cache.invalidate?" confusion (two consumers exist).
