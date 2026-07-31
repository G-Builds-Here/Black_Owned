<!--
surveyed_at: 2026-07-31T08:00:33Z
commit: f43142ed0117498d3b05a2409d4893181c7506d0
relevant_paths:
- e2e/*.spec.ts
- jest.setup.ts
- vitest.setup.ts
- playwright.config.ts
- bw-api/src/graphql/tests.rs
summary: 4 test groups documented - Jest, Vitest, Playwright, Rust integration tests.
-->

# Test Infrastructure

## Test Groups

### Unit Tests (Jest)
- **Location**: `src/**/*.spec.ts`, `src/**/*.test.ts`
- **Runner**: Jest 29.7.0
- **Setup**: `jest.setup.ts` - provides `@testing-library/jest-dom` matchers and TextEncoder/TextDecoder polyfills
- **Purpose**: Component unit tests, utility function tests, service layer tests

### Integration Tests (Vitest)
- **Runner**: Vitest 4.1.10
- **Setup**: `vitest.setup.ts` - mocks PerformanceObserver and performance API for testing
- **Purpose**: API integration tests, database integration tests, GraphQL resolver tests

### End-to-End Tests (Playwright)
- **Location**: `e2e/*.spec.ts`
- **Runner**: Playwright 1.62
- **Files**:
  - `e2e/features.spec.ts` - AC validation tests for design system, UI components, business directory
  - `e2e/performance.spec.ts` - Core Web Vitals tests (LCP, FID, CLS, TTI)
- **Browser Coverage**: Chromium, Firefox, WebKit
- **Configuration**:
  - `fullyParallel: true` - tests run in parallel across browsers
  - `retries: 2` in CI mode
  - `workers: 1` in CI mode for stability
  - `timeout: 60000ms` per test
  - Screenshots and video captured on failure only
  - Trace enabled on first retry

### Rust Integration Tests (bw-api)
- **Location**: `bw-api/src/graphql/tests.rs`
- **Runner**: Cargo test (tokio runtime)
- **Test Coverage**:
  - `test_submit_review_success` - validates review submission flow
  - `test_submit_review_duplicate_rejected` - validates duplicate prevention
  - `test_rating_aggregation` - validates rating calculation (avg, count)
  - `test_submit_review_invalid_rating` - validates rating range enforcement (1-5)
  - `test_business_rating_avg_none_when_no_reviews` - validates null handling
  - `test_update_business_owner_success` - validates owner authorization
  - `test_update_business_not_owner_rejected` - validates authorization denial
  - `test_update_business_not_found_returns_null` - validates null response for missing resources
  - `test_update_business_partial_fields` - validates partial updates preserve unchanged fields
- **Database**: PostgreSQL via sqlx with test schema setup

## Running Tests

### Frontend Tests
```bash
# Unit tests
npm test

# E2E tests (requires dev server running on port 3000)
npx playwright test

# Run specific test file
npx playwright test e2e/features.spec.ts

# Run with UI mode
npx playwright test --ui

# Run single browser
npx playwright test --project=chromium

# Vitest tests
npx vitest
```

### Rust API Tests
```bash
# Run all tests
cargo test

# Run specific test
cargo test test_submit_review_success

# Run with database
DATABASE_URL=postgres://... cargo test
```

### Test Coverage
- Jest configured with `ts-jest` for TypeScript support
- Coverage reports not explicitly configured in package.json
- `testcontainers` dependency suggests containerized integration test support

## Credential Chain

### Database
- Uses `DATABASE_URL` environment variable
- Default test database: `postgres://postgres:postgres@localhost:5432/black_owned_test`
- sqlx requires database connection at compile time for query validation

### MinIO (Object Storage)
- MinIO client configured via `minio` package
- Credentials likely via environment variables (MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY)

### NATS (Message Broker)
- NATS client via `nats` package
- Connection configured via environment variable (NATS_URL)

### Authentication
- JWT-based authentication using `jsonwebtoken`
- Token refresh logic in `src/lib/auth/token-refresh.ts`
- Auth middleware in `bw-api/src/middleware/auth.rs` extracts user from JWT

### Test Data Seeding
- `src/utils/seed-runner.ts` - handles test data seeding
- Business repository pattern in `src/lib/db/business-repository.ts`

## Test Organization

```
Black_Owned/
├── src/
│   ├── __tests__/           # Unit tests (implied structure)
│   └── lib/
│       └── auth/
│       └── db/
│       └── valkey/
│       └── nats/
├── e2e/
│   ├── features.spec.ts     # Feature/AC validation
│   └── performance.spec.ts  # Performance standards
├── bw-api/
│   └── src/
│       └── graphql/
│           └── tests.rs     # GraphQL integration tests
├── packages/
│   └── ui/                  # UI component library
├── jest.setup.ts
├── vitest.setup.ts
├── playwright.config.ts
└── tsconfig.json            # Excludes test files from main build
```

## Key Observations

1. **Multi-runner strategy**: Jest for React components, Vitest for API/integration, Playwright for E2E, Cargo for Rust
2. **Test isolation**: Each test creates fresh database schema in Rust tests
3. **Parallel execution**: Playwright runs tests in parallel across browsers
4. **CI considerations**: Retries enabled, single worker for stability, artifacts captured on failure
5. **Type safety**: Strict TypeScript enabled, ts-jest for type-aware tests
6. **Performance testing**: Core Web Vitals measured via PerformanceObserver API
