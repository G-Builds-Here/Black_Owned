import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    fakeTimers: {
      toFake: ['setTimeout', 'setInterval'],
    },
    mockReset: true,
  },
  deps: {
    optimizer: {
      web: {
        include: ['vitest'],
      },
    },
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    exclude: ['node_modules/', '.next/'],
  },
});
