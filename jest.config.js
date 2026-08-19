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
    "src/app/performance\\.test\\.ts$",
    "-integration\\.spec\\.ts$",
    "src/lib/minio/minio-service\\.spec\\.ts$",
  ],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.spec.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  verbose: true,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^next/server$": "<rootDir>/__mocks__/next-server.ts",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};
