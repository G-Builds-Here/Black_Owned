import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Provide jest global for jest.fn() compatibility
(global as any).jest = {
  fn: vi.fn.bind(vi),
  mock: vi.mock.bind(vi),
  clearAllMocks: vi.clearAllMocks.bind(vi),
  resetAllMocks: vi.resetAllMocks.bind(vi),
};

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
};

// Mock performance API
(global as any).performance = {
  timing: {
    navigationStart: 0,
    domInteractive: 4500,
  },
  getEntriesByType: () => [],
};
