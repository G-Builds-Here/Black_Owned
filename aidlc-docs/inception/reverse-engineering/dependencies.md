<!--
surveyed_at: 2026-07-31T08:00:33Z
commit: f43142ed0117498d3b05a2409d4893181c7506d0
relevant_paths:
- package.json
- bw-api/Cargo.toml
- packages/ui/package.json
summary: 35+ npm packages, 20+ Rust crates catalogued with concerns identified.
-->

# Dependencies

## External Packages

### Frontend (npm) - Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | - | React framework, SSR, routing |
| `react` | - | UI component library |
| `react-dom` | - | React DOM rendering |
| `@apollo/server` | - | GraphQL server |
| `@graphql-tools/schema` | - | GraphQL schema management |
| `graphql` | - | GraphQL specification implementation |
| `graphql-request` | - | GraphQL HTTP client |
| `bcryptjs` | - | Password hashing |
| `jsonwebtoken` | - | JWT token generation/validation |
| `pg` | - | PostgreSQL client |
| `minio` | - | MinIO/S3 object storage client |
| `nats` | - | NATS messaging client |

### Frontend (npm) - Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@playwright/test` | - | E2E testing |
| `@tailwindcss/postcss` | - | Tailwind CSS PostCSS plugin |
| `@testing-library/jest-dom` | - | Jest DOM matchers |
| `@testing-library/react` | - | React testing utilities |
| `@types/*` | - | TypeScript type definitions |
| `autoprefixer` | - | CSS autoprefixer |
| `eslint` | - | Linting |
| `eslint-config-next` | - | Next.js ESLint config |
| `jest` | - | Unit testing framework |
| `jest-environment-jsdom` | - | Jest jsdom environment |
| `js-yaml` | - | YAML parsing |
| `postcss` | - | CSS processing |
| `tailwindcss` | - | Utility-first CSS framework |
| `testcontainers` | - | Integration test containers |
| `ts-jest` | - | TypeScript Jest preprocessor |
| `ts-node` | - | TypeScript execution |
| `typescript` | - | Type checker and compiler |
| `vitest` | - | Vite-native testing framework |

### Rust (bw-api) - Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `bw-types` | path | Shared type definitions |
| `async-graphql` | 7.0 | GraphQL server implementation |
| `sqlx` | 0.7 | Async SQL toolkit with PostgreSQL support |
| `tower` | 0.5 | Middleware and service abstraction |
| `tower-layer` | 0.3 | Tower layer type |
| `futures` | 0.3 | Async utilities |
| `axum` | 0.8 | Web framework |
| `axum-extra` | 0.10 | Extra axum features |
| `tokio` | 1.x | Async runtime |
| `hyper` | 1.x | HTTP library |
| `hyper-util` | 0.1 | Hyper utilities |
| `http-body` | 1.0 | HTTP body types |
| `http-body-util` | 0.1 | HTTP body utilities |
| `jsonwebtoken` | 9.3 | JWT handling |
| `serde` | - | Serialization |
| `serde_json` | - | JSON serialization |
| `chrono` | - | Date/time handling |
| `uuid` | - | UUID generation |

### Rust (bw-types) - Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `serde` | - | Serialization |
| `serde_json` | - | JSON serialization |
| `derive_builder` | - | Builder pattern derivation |
| `chrono` | - | Date/time handling |
| `uuid` | - | UUID types |

## Internal Dependency Graph

```
black-owned-frontend (Next.js)
├── bw-api (Rust GraphQL API)
│   └── bw-types (Shared types)
│       ├── serde
│       ├── serde_json
│       ├── derive_builder
│       ├── chrono
│       └── uuid
├── PostgreSQL (via pg / sqlx)
├── Valkey (via ioredis)
├── MinIO (via minio / @minio/client)
├── NATS (via nats)
└── ClickHouse (direct HTTP)

bw-api
├── bw-types (internal)
├── async-graphql
├── sqlx (PostgreSQL)
├── tower (middleware)
├── axum (web framework)
└── tokio (async runtime)
```

## Dependency Concerns

### Security Considerations

| Package | Concern | Recommendation |
|---------|---------|----------------|
| `minio` | Package name confusion - may be outdated | Verify if `@minio/client` should be used instead |
| `jsonwebtoken` | Check for CVEs regularly | Run `npm audit` periodically |
| `bcryptjs` | Ensure latest version for security | Verify version against known vulnerabilities |

### Version Pinning Issues

**Observation**: The pre-scan shows packages without specific versions (shown as "dep" or "devDep"). This indicates:
- Versions may not be pinned in package.json
- Could lead to inconsistent builds
- Recommendation: Pin all production dependencies to specific versions

### Potential Duplication

| Observation | Impact |
|-------------|--------|
| Multiple worktree package.json files with varying dependencies | May indicate inconsistent dev environments |
| `@minio/client` and `minio` both appear in different scans | Potential confusion - should standardize on one |
| `ioredis` appears in some scans, not others | Valkey client inconsistency |

### Missing Dependencies

| Area | Missing | Recommendation |
|------|---------|----------------|
| Security scanning | No SCA tool configured | Consider Snyk, Dependabot, or npm audit |
| License compliance | No license scanning | Add FOSSA or similar for compliance |

### Build/Dev Tool Observations

- `testcontainers` in production dependencies - should be dev-only
- `ts-node` in production - consider moving to devDependencies
- `vitest` and `jest` both present - potential redundancy

## Recommendations

1. **Pin all versions** in package.json to ensure reproducible builds
2. **Audit dependencies** with `npm audit` and address high/critical findings
3. **Standardize on one MinIO client** - either `minio` or `@minio/client`
4. **Move testcontainers to devDependencies** - not needed in production
5. **Consolidate test frameworks** - choose either Jest or Vitest, not both
6. **Add dependency update automation** - Dependabot or Renovate for security updates
