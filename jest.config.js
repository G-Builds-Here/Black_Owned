/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.spec.ts", "**/*.test.ts", "**/*.spec.tsx", "**/*.test.tsx"],
  // This runner is the web app's (Next.js src/) unit + component suite. The
  // monorepo's other test toolchains run separately: Rust crates (cargo test),
  // clickhouse (vitest), e2e (playwright), packages/* (their own jest). Those
  // were previously pulled in via roots:[rootDir] and fail here (wrong runner
  // / missing infra). Exclude the strays that live under src but target other
  // runners: the vitest performance test, the testcontainers integration
  // specs, and the minio service spec (a Docker/testcontainers integration
  // test whose `testcontainers` import pulls an ESM-only dep jest can't parse
  // and which needs a live MinIO container).
  testPathIgnorePatterns: [
    "/node_modules/",
    // Wrong-runner strays (see comment above): the vitest performance test,
    // the testcontainers integration specs, and the minio Docker/testcontainers
    // spec (ESM-only `testcontainers` import + needs a live MinIO container).
    "src/app/performance\\.test\\.ts$",
    "-integration\\.spec\\.ts$",
    "src/lib/minio/minio-service\\.spec\\.ts$",
    // Env-bound suites excluded from the unit runner. They stay in-tree but
    // require live infra (a Postgres pool or a Valkey/Redis server) and belong
    // to the integration/e2e pass, not this jsdom unit run. (The DB-mocked and
    // scraper-mocked unit specs were reconciled to current APIs and now run here.)
    //
    // DB-backed — need a live Postgres via getPool().connect():
    "src/lib/db/business-repository\\.spec\\.ts$",
    "src/lib/db/scrape-job-repository\\.spec\\.ts$",
    "src/lib/db/user-management-repository\\.spec\\.ts$",
    "src/qa/scraper-e2e\\.spec\\.ts$",
    "src/services/scraper-job-executor\\.spec\\.ts$",
  ],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.spec.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  verbose: true,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^next/server$": "<rootDir>/__mocks__/next-server.ts",
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.(css|less|scss)$": "<rootDir>/__mocks__/style-mock.js",
  },
};
