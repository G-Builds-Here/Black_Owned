<!--
surveyed_at: 2026-07-31T08:00:33Z
commit: f43142ed0117498d3b05a2409d4893181c7506d0
relevant_paths:
- **/*Helper*
- **/*Tests*/**
summary: Anti-patterns analysis complete.
-->

# Anti-Patterns

## Helper Duplication

No helper duplication detected. The codebase does not contain traditional helper files. Test utilities are centralized in:
- `jest.setup.ts` - Jest polyfills and matchers
- `vitest.setup.ts` - Vitest mocks for performance API

## Other Anti-Patterns

### 1. TypeScript Configuration Inconsistency [MEDIUM]

**What**: tsconfig.json excludes test files (`**/*.spec.ts`, `**/*.test.ts`) but this exclusion may cause IDE confusion and build pipeline inconsistencies.

**Why**: Test files are excluded from the main TypeScript compilation context, which can lead to:
- Type errors not being caught in IDE for test files
- Inconsistent type checking between `tsc` and test runners
- Potential for tests to pass locally but fail in CI due to type mismatches

**Location**: `tsconfig.json` lines 40-48

**Recommendation**: Consider separating test and non-test configs:
```json
{
  "extends": "./tsconfig.json",
  "include": ["**/*.spec.ts", "**/*.test.ts"],
  "exclude": []
}
```

### 2. Hardcoded Test Database Credentials [HIGH]

**What**: Rust test code contains hardcoded database credentials in `bw-api/src/graphql/tests.rs`:
```rust
let database_url = std::env::var("DATABASE_URL")
    .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/black_owned_test".to_string());
```

**Why**:
- Security risk if test code is deployed to production
- Credentials exposed in version control
- Default credentials (`postgres:postgres`) are well-known and insecure

**Recommendation**:
- Use environment-specific credential files (`.env.test`)
- Add `.env*` to `.gitignore`
- Consider using test containers for isolated test databases

### 3. Missing Coverage Configuration [LOW]

**What**: No explicit coverage configuration in `package.json` or Jest config.

**Why**:
- Cannot track test coverage metrics
- No coverage thresholds to prevent regression
- Difficult to identify untested code paths

**Recommendation**: Add coverage configuration:
```json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

### 4. Performance Test FID Measurement Inaccuracy [MEDIUM]

**What**: FID (First Input Delay) test in `e2e/performance.spec.ts` uses a simplistic measurement:
```typescript
const startTime = Date.now();
await page.click('body');
const fid = Date.now() - startTime;
```

**Why**:
- Does not accurately measure FID (which is time to process event handler, not click execution)
- Clicking `body` may not trigger meaningful event handlers
- Actual FID requires measuring delay between user input and event handler start

**Recommendation**: Use Playwright's built-in performance tracing or Web Vitals library for accurate measurement.

### 5. GraphQL Test Schema Recreation [MEDIUM]

**What**: Each Rust test recreates the entire database schema via `setup_test_schema()`:
```rust
CREATE TABLE IF NOT EXISTS businesses (...);
CREATE TABLE IF NOT EXISTS reviews (...);
```

**Why**:
- Slow test execution due to repeated schema creation
- Potential for schema drift between tests
- No cleanup of test data between tests

**Recommendation**:
- Use database transactions that rollback after each test
- Use test containers with pre-seeded schema
- Implement test fixtures instead of inline schema creation

### 6. Missing Error Handling in Tests [LOW]

**What**: Tests use `.unwrap()` extensively without testing error paths:
```rust
.execute(schema.data::<sqlx::PgPool>().unwrap())
.await
.unwrap();
```

**Why**:
- Tests may panic on unexpected errors instead of failing gracefully
- Error handling paths not validated
- Reduces test reliability

**Recommendation**: Use `.expect()` with descriptive messages or proper error handling patterns.

### 7. Playwright WebServer Disabled [LOW]

**What**: Playwright config has webServer commented out:
```typescript
// webServer: {
//   command: 'npm run dev',
//   url: 'http://localhost:3001',
//   reuseExistingServer: !process.env.CI,
// },
```

**Why**:
- Requires manual dev server startup before running tests
- Easy to forget and run tests against wrong port
- CI/CD pipeline may fail if server not started

**Recommendation**: Enable webServer with proper port configuration, or document requirement clearly.

### 8. No Mock Service Layer Tests [MEDIUM]

**What**: Tests focus on GraphQL layer but lack dedicated service/repository tests.

**Why**:
- Business logic in services may be untested
- Database repository patterns not independently validated
- Tight coupling between layers makes testing difficult

**Recommendation**: Add unit tests for:
- `src/lib/db/business-repository.ts`
- `src/lib/minio/minio-service.ts`
- `src/lib/nats/cache-invalidator.ts`
- `src/lib/valkey/valkey-client.ts`

### 9. Inconsistent Test Naming [LOW]

**What**: Test names follow different conventions:
- `test_submit_review_success` (snake_case, Rust)
- `should load the page` (sentence case, Playwright)
- `should display business card grid` (sentence case, Playwright)

**Why**:
- Inconsistent documentation
- Harder to search/filter tests
- Confusing for new contributors

**Recommendation**: Adopt consistent naming convention across all test suites.

### 10. Missing Integration Test Matrix [LOW]

**What**: No tests for integration between services (NATS + Valkey + MinIO).

**Why**:
- Inter-service communication not validated
- Cache invalidation flows untested
- Event-driven architecture not verified end-to-end

**Recommendation**: Add integration tests that exercise full service mesh using test containers.

## Summary Table

| Issue | Severity | File | Impact |
|-------|----------|------|--------|
| Hardcoded DB credentials | HIGH | bw-api/src/graphql/tests.rs | Security risk |
| TypeScript config inconsistency | MEDIUM | tsconfig.json | Build reliability |
| FID measurement inaccuracy | MEDIUM | e2e/performance.spec.ts | False confidence |
| GraphQL schema recreation | MEDIUM | bw-api/src/graphql/tests.rs | Slow tests |
| Missing service tests | MEDIUM | src/lib/* | Coverage gaps |
| Missing coverage config | LOW | package.json | No metrics |
| WebServer disabled | LOW | playwright.config.ts | CI fragility |
| Missing error handling | LOW | bw-api/src/graphql/tests.rs | Test reliability |
| Inconsistent naming | LOW | All test files | Maintainability |
| Missing integration matrix | LOW | e2e/ | Architecture gaps |
