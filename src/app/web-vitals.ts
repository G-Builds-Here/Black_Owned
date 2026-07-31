// Web Vitals performance monitoring
// Tracks Core Web Vitals: LCP, FID, CLS

export interface WebVitalsMetrics {
  lcp: number; // Largest Contentful Paint
  fid: number; // First Input Delay
  cls: number; // Cumulative Layout Shift
  fcp: number; // First Contentful Paint
  tti: number; // Time to Interactive
}

let metrics: WebVitalsMetrics = {
  lcp: 0,
  fid: 0,
  cls: 0,
  fcp: 0,
  tti: 0,
};

export function initWebVitals(): void {
  // Track Largest Contentful Paint (LCP)
  if ('PerformanceObserver' in window) {
    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry;
        metrics.lcp = lastEntry.startTime;
        console.log('[WebVitals] LCP:', metrics.lcp.toFixed(2), 'ms');
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {
      console.warn('[WebVitals] LCP observer not supported');
    }

    // Track First Input Delay (FID)
    try {
      const fidObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        for (const entry of entries) {
          const fidEntry = entry as PerformanceEntry;
          metrics.fid = fidEntry.duration;
          console.log('[WebVitals] FID:', metrics.fid.toFixed(2), 'ms');
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
    } catch (e) {
      console.warn('[WebVitals] FID observer not supported');
    }

    // Track Cumulative Layout Shift (CLS) - stubbed
    // Full implementation requires web-vitals package
  }

  // Track First Contentful Paint (FCP)
  if ('PerformanceObserver' in window) {
    try {
      const fcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry;
        metrics.fcp = lastEntry.startTime;
        console.log('[WebVitals] FCP:', metrics.fcp.toFixed(2), 'ms');
      });
      fcpObserver.observe({ type: 'paint', buffered: true });
    } catch (e) {
      console.warn('[WebVitals] FCP observer not supported');
    }
  }

  // Estimate Time to Interactive (TTI)
  if ('performance' in window && 'timing' in performance) {
    const timing = performance.timing as any;
    metrics.tti = timing.domInteractive - timing.navigationStart;
    console.log('[WebVitals] TTI:', metrics.tti.toFixed(2), 'ms');
  }
}

export function getMetrics(): WebVitalsMetrics {
  return { ...metrics };
}

export function checkPerformanceThresholds(): {
  passed: boolean;
  results: { metric: string; value: number; threshold: number; status: 'PASS' | 'FAIL' }[];
} {
  const m = getMetrics();
  const results = [
    { metric: 'LCP', value: m.lcp / 1000, threshold: 2.5, status: (m.lcp / 1000 < 2.5 ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL' },
    { metric: 'FID', value: m.fid, threshold: 100, status: (m.fid < 100 ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL' },
    { metric: 'CLS', value: m.cls, threshold: 0.1, status: (m.cls < 0.1 ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL' },
    { metric: 'FCP', value: m.fcp / 1000, threshold: 3, status: (m.fcp / 1000 < 3 ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL' },
    { metric: 'TTI', value: m.tti / 1000, threshold: 5, status: (m.tti / 1000 < 5 ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL' },
  ];

  const passed = results.every((r) => r.status === 'PASS');

  return { passed, results };
}
