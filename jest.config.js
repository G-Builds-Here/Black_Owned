/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src", "<rootDir>"],
  testMatch: ["**/*.spec.ts", "**/*.test.ts", "**/*.spec.tsx", "**/*.test.tsx"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.spec.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  verbose: true,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^next/server$": "<rootDir>/__mocks__/next-server.ts",
    "^@minio/client$": "<rootDir>/__mocks__/@minio/index.ts",
    "^@/components/ui/Navigation$": "<rootDir>/__mocks__/navigation.tsx",
    "^@/components/ui$": "<rootDir>/__mocks__/ui-components.tsx",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  modulePathIgnorePatterns: ["<rootDir>/.worktrees"],
};
