import '@testing-library/jest-dom';

// Mock PerformanceObserver for vitest tests
global.PerformanceObserver = class {
  constructor(callback: any) {
    // Mock callback
  }
  observe(options: any) {
    // Mock observe
  }
  disconnect() {
    // Mock disconnect
  }
  static supportedEntryTypes: readonly string[] = [];
} as any;

// Mock performance API
(global as any).performance = {
  timing: {
    navigationStart: 0,
    domInteractive: 4500,
  },
  getEntriesByType: () => [],
};
