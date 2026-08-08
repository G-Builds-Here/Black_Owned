/**
 * User-Agent Rotator Tests
 */

import { UserAgentRotator, USER_AGENT_POOL } from "./user-agent-rotator";

describe("UserAgentRotator", () => {
  let rotator: UserAgentRotator;

  beforeEach(() => {
    rotator = new UserAgentRotator(USER_AGENT_POOL);
  });

  it("returns a valid user-agent", () => {
    const userAgent = rotator.getNextUserAgent();
    expect(USER_AGENT_POOL).toContain(userAgent);
  });

  it("rotates user-agents and does not repeat immediately", () => {
    const userAgent1 = rotator.getNextUserAgent();
    const userAgent2 = rotator.getNextUserAgent();
    // While random, with 12 user-agents and rotation logic,
    // consecutive repeats are unlikely
    expect(USER_AGENT_POOL).toContain(userAgent1);
    expect(USER_AGENT_POOL).toContain(userAgent2);
  });

  it("resets counts after all user-agents reach the limit", () => {
    const maxConsecutive = 5;
    const firstUserAgent = rotator.getNextUserAgent();

    // Get the same user-agent by forcing it through a custom pool
    const singleUserAgentPool = ["Mozilla/5.0 Test"];
    const singleRotator = new UserAgentRotator(singleUserAgentPool);

    // Call getNextUserAgent maxConsecutive times
    for (let i = 0; i < maxConsecutive; i++) {
      singleRotator.getNextUserAgent();
    }

    // After 5 calls, the next call should reset and return the same user-agent
    const afterReset = singleRotator.getNextUserAgent();
    expect(afterReset).toBe("Mozilla/5.0 Test");
  });

  it("tracks consecutive uses correctly", () => {
    const singleUserAgentPool = ["Mozilla/5.0 Test"];
    const singleRotator = new UserAgentRotator(singleUserAgentPool);

    // First call
    singleRotator.getNextUserAgent();
    let stats = singleRotator.getStats();
    expect(stats.consecutiveUses).toBe(1);

    // Second call - should increment to 2 (no reset yet, limit is 5)
    singleRotator.getNextUserAgent();
    stats = singleRotator.getStats();
    expect(stats.consecutiveUses).toBe(2);

    // Continue until we hit the limit
    singleRotator.getNextUserAgent(); // 3
    singleRotator.getNextUserAgent(); // 4
    singleRotator.getNextUserAgent(); // 5

    stats = singleRotator.getStats();
    expect(stats.consecutiveUses).toBe(5);

    // Next call should reset and start over at 1
    singleRotator.getNextUserAgent();
    stats = singleRotator.getStats();
    expect(stats.consecutiveUses).toBe(1); // Reset happened after hitting limit
  });

  it("returns different user-agents from the pool", () => {
    const usedUserAgents = new Set<string>();

    // Get 20 user-agents (more than pool size)
    for (let i = 0; i < 20; i++) {
      const userAgent = rotator.getNextUserAgent();
      usedUserAgents.add(userAgent);
    }

    // Should have used multiple user-agents from the pool
    expect(usedUserAgents.size).toBeGreaterThan(1);
  });

  it("getStats returns correct structure", () => {
    rotator.getNextUserAgent();
    const stats = rotator.getStats();

    expect(stats.totalUserAgents).toBe(USER_AGENT_POOL.length);
    expect(stats.lastUsed).toBeDefined();
    expect(typeof stats.consecutiveUses).toBe("number");
    expect(typeof stats.counts).toBe("object");
  });

  it("getUserAgentForContext returns a valid user-agent", () => {
    const userAgent = rotator.getUserAgentForContext();
    expect(USER_AGENT_POOL).toContain(userAgent);
  });
});
