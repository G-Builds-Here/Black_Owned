/**
 * User-Agent Rotator
 *
 * Provides user-agent rotation from a pool of legitimate browser user-agents.
 * Ensures no single user-agent is used more than 5 times consecutively.
 */

/**
 * Browser user-agent strings for rotation
 * These are real user-agents from popular browsers on various platforms
 */
const USER_AGENT_POOL = [
  // Chrome on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  // Chrome on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  // Firefox on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  // Firefox on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
  // Safari on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  // Edge on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
];

const MAX_CONSECUTIVE_USES = 5;

/**
 * User-Agent Rotator class
 */
export class UserAgentRotator {
  private userAgentPool: string[];
  private consecutiveCounts: Map<string, number>;
  private lastUsedUserAgent: string | null;
  private consecutiveUses: number;

  constructor(userAgentPool: string[] = USER_AGENT_POOL) {
    this.userAgentPool = userAgentPool;
    this.consecutiveCounts = new Map();
    this.lastUsedUserAgent = null;
    this.consecutiveUses = 0;

    // Initialize counts
    for (const ua of userAgentPool) {
      this.consecutiveCounts.set(ua, 0);
    }
  }

  /**
   * Get the next user-agent in rotation
   * Ensures no single user-agent is used more than MAX_CONSECUTIVE_USES times consecutively
   */
  getNextUserAgent(): string {
    // If all user-agents have reached the limit, reset counts
    const allAtLimit = Array.from(this.consecutiveCounts.values()).every(
      (count) => count >= MAX_CONSECUTIVE_USES
    );

    if (allAtLimit) {
      this.resetCounts();
    }

    // Filter out user-agents that have reached the limit
    const availableUserAgents = this.userAgentPool.filter((ua) => {
      const count = this.consecutiveCounts.get(ua) || 0;
      return count < MAX_CONSECUTIVE_USES;
    });

    // If no user-agents are available (shouldn't happen due to reset above), reset and try again
    if (availableUserAgents.length === 0) {
      this.resetCounts();
      const randomIndex = Math.floor(Math.random() * this.userAgentPool.length);
      const selected = this.userAgentPool[randomIndex];
      this.lastUsedUserAgent = selected;
      this.consecutiveUses = 1;
      this.consecutiveCounts.set(selected, 1);
      return selected;
    }

    // Select a random user-agent from available ones (excluding last used if possible)
    const filteredPool = availableUserAgents.filter(
      (ua) => ua !== this.lastUsedUserAgent
    );
    const poolToUse = filteredPool.length > 0 ? filteredPool : availableUserAgents;

    const randomIndex = Math.floor(Math.random() * poolToUse.length);
    const selected = poolToUse[randomIndex];

    // Update tracking
    this.lastUsedUserAgent = selected;
    this.consecutiveUses = (this.consecutiveCounts.get(selected) || 0) + 1;
    this.consecutiveCounts.set(selected, this.consecutiveUses);

    return selected;
  }

  /**
   * Get a user-agent for a specific context
   * This is the main entry point for scrapers
   */
  getUserAgentForContext(): string {
    return this.getNextUserAgent();
  }

  /**
   * Reset all consecutive counts
   */
  private resetCounts(): void {
    for (const ua of this.userAgentPool) {
      this.consecutiveCounts.set(ua, 0);
    }
    this.lastUsedUserAgent = null;
    this.consecutiveUses = 0;
  }

  /**
   * Get current rotation stats (for debugging)
   */
  getStats(): {
    totalUserAgents: number;
    lastUsed: string | null;
    consecutiveUses: number;
    counts: Record<string, number>;
  } {
    const counts: Record<string, number> = {};
    for (const [ua, count] of this.consecutiveCounts.entries()) {
      counts[ua] = count;
    }
    return {
      totalUserAgents: this.userAgentPool.length,
      lastUsed: this.lastUsedUserAgent,
      consecutiveUses: this.consecutiveUses,
      counts,
    };
  }
}

// Singleton instance for global use
let rotatorInstance: UserAgentRotator | null = null;

export function getUserAgentRotator(): UserAgentRotator {
  if (!rotatorInstance) {
    rotatorInstance = new UserAgentRotator();
  }
  return rotatorInstance;
}

export { USER_AGENT_POOL };
