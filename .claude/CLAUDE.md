# Black_Owned — Project Instructions

Public directory of Black-owned businesses: Next.js 16 web app (UI + REST/GraphQL API) on the host, Rust workspace (bw-scraper active; bw-ingestion/bw-api library/retired) in Docker, backed by Postgres/Valkey/NATS/ClickHouse/MinIO.

Repo facts — setup, commands, environment, credentials, test patterns, gotchas — are maintained in the survey artifacts under `.claude/codebase/`, not in this file. Trust the artifact headers (`surveyed_at`, `commit`) over memory; `/luke` refreshes them.

## Architecture

Codebase survey artifacts are in `.claude/codebase/`.
Each file has a metadata header showing when it was surveyed and which paths it covers —
check the header against what you are currently editing to assess freshness.
Read the relevant file directly when you need it. Start at `index.md`.

| File | Read when you need |
|------|--------------------|
| `index.md` | Survey navigation hub |
| `overview.md` | Business purpose, entry points, running modes, first-time setup |
| `architecture.md` | Component map, service boundaries, why the structure exists |
| `api-documentation.md` | Endpoint contracts — request/response shapes, auth, status codes |
| `patterns.md` | Conventions: auth, response envelope, data access, testing, migrations |
| `domain-model.md` | Postgres tables, TypeScript types, GraphQL types |
| `dependencies.md` | External services, env vars, dependency risks |
| `component-inventory.md` | Component list with responsibilities and key files |
| `code-structure.md` | Namespace/module layout, data flow, notable patterns |
| `technology-stack.md` | Frameworks, runtimes, service versions |
| `test-infrastructure.md` | How to run tests, how to add a new test, mock patterns |
| `findings.md` | Violations, recommendations, tech debt, gotchas — read before touching unfamiliar areas |
| `anti-patterns.md` | What NOT to replicate in this codebase, with evidence |

If the file you are editing matches paths listed in an artifact's `relevant_paths` header
and commits have landed since the artifact's `commit` header, note this to the user —
the artifact may be stale for that area. Run `/luke` to refresh specific artifacts.

## AI Context Protocol

Before answering codebase questions, writing or editing code, or making architectural decisions, follow this fallback chain:

1. **Index once per session** — run `ctx_batch_execute` over all `*.md` files in `.claude/codebase/` to load them into the searchable knowledge base
2. **Search first** — run `ctx_search` with a specific query; returns focused excerpts without reading raw files
3. **Agent fallback** — if `ctx_search` returns nothing useful, spawn `.claude/agents/luke-context.md` with `QUESTION`, `REPO_ROOT`, and `ARTIFACT_DIR`
4. **No artifacts** — if `.claude/codebase/` is empty, offer to run `/luke`
