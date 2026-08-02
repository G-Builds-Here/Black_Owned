/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  modulePathIgnorePatterns: ["<rootDir>/\\.worktrees/"],
  testPathIgnorePatterns: ["<rootDir>/\\.worktrees/"],
  testMatch: ["**/*.spec.ts", "**/*.test.ts", "**/*.spec.tsx", "**/*.test.tsx"],
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
