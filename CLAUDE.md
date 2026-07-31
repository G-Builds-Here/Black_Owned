# Black Owned - Project Context

**Last Survey:** 2026-07-31 | **Commit:** f43142ed

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Next.js dev server |
| `npm test` | Run Jest unit tests |
| `npx vitest` | Run Vitest integration tests |
| `npx playwright test` | Run E2E tests |
| `cargo test -p bw-api` | Run Rust GraphQL tests |
| `docker compose up` | Start all infrastructure services |

## Environment Setup

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/black_owned

# Cache
VALKEY_URL=redis://localhost:6379

# Object Storage
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# Messaging
NATS_URL=nats://localhost:4222

# JWT
JWT_SECRET=your-secret-key-here
```

### Infrastructure Services

Run with Docker Compose:
```bash
docker compose up -d
```

This starts:
- PostgreSQL 15 (port 5432)
- Valkey 7.2 (port 6379)
- MinIO (port 9000)
- NATS 2.10 (port 4222)
- ClickHouse 23.8 (port 8123)

## Architecture

This project uses a **polyglot architecture** combining Next.js/TypeScript frontend with Rust backend services.

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Frontend | `src/` | Next.js application with React components |
| API (TypeScript) | `src/app/api/` | Next.js API routes for auth, users |
| API (Rust) | `bw-api/` | High-performance GraphQL server |
| Types (Rust) | `bw-types/` | Shared type definitions |
| Services | `bw-ingestion/` | Background workers (email, images, cache) |
| UI Library | `packages/ui/` | Reusable React component library |

### Survey Artifacts

Full architecture documentation is maintained in `aidlc-docs/inception/reverse-engineering/`:

- [Overview](aidlc-docs/inception/reverse-engineering/overview.md) - Business capabilities
- [Architecture](aidlc-docs/inception/reverse-engineering/architecture.md) - System design
- [Technology Stack](aidlc-docs/inception/reverse-engineering/technology-stack.md) - Tech decisions
- [API Documentation](aidlc-docs/inception/reverse-engineering/api-documentation.md) - API surface
- [Anti-Patterns](aidlc-docs/inception/reverse-engineering/anti-patterns.md) - Quality issues

### Data Flow

```
User → Next.js → GraphQL/REST → bw-api (Rust) → PostgreSQL/Valkey/MinIO
                              → NATS → bw-ingestion (background workers)
```

## Gotchas

1. **Dual GraphQL**: Both TypeScript (Apollo) and Rust (async-graphql) implementations exist - use Rust for new features
2. **Testcontainers in prod**: Move to devDependencies before deployment
3. **MinIO client**: Standardize on `minio` package (not `@minio/client`)
4. **Playwright requires dev server**: Start `npm run dev` before running E2E tests
5. **Rust tests need database**: Set `DATABASE_URL` before running `cargo test`

## Development Workflow

1. Start infrastructure: `docker compose up -d`
2. Start dev server: `npm run dev`
3. Run tests: `npm test` (unit), `npx playwright test` (E2E)
4. For Rust changes: `cargo build -p bw-api`
