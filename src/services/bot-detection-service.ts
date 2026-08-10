/**
 * Bot Detection Service
 *
 * Detects bot challenge responses (CAPTCHA, challenge pages, etc.)
 * and handles the retry logic with appropriate delays.
 */

/**
 * Represents a bot detection event
 */
export interface BotDetectionEvent {
  timestamp: Date;
  source: string;
  challengeType: string;
  details?: string;
}

/**
 * Bot detection configuration
 */
export interface BotDetectionConfig {
  /** Delay in milliseconds before retrying after bot detection (default: 60000) */
  retryDelayMs: number;
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
}

/**
 * Bot detection result
 */
export interface BotDetectionResult {
  isBotDetected: boolean;
  challengeType?: string;
  shouldRetry: boolean;
  retryCount: number;
}

/**
 * Bot detection service that identifies and handles bot challenges
 */
export class BotDetectionService {
  private config: Required<BotDetectionConfig>;
  private detectionLog: BotDetectionEvent[] = [];
  private retryCounts: Map<string, number> = new Map();

  constructor(config: BotDetectionConfig = {}) {
    this.config = {
      retryDelayMs: config.retryDelayMs ?? 60000, // 60 seconds
      maxRetries: config.maxRetries ?? 3,
    };
  }

  /**
   * Detects if a bot challenge is present in the page content
   *
   * @param pageContent - The HTML content to check
   * @param source - The scraper source (e.g., "yelp", "facebook", "google-maps")
   * @returns BotDetectionResult
   */
  detectBotChallenge(pageContent: string, source: string): BotDetectionResult {
    const challengePatterns = [
      // reCAPTCHA patterns (must come before generic captcha)
      /recaptcha/i,
      /google recaptcha/i,
      /g-recaptcha/i,

      // hCaptcha patterns
      /hcaptcha/i,

      // Cloudflare patterns
      /cloudflare/i,
      /cf_chl/i,
      /cf_captcha/i,
      /checking your browser/i,
      /please wait while we verify/i,

      // CAPTCHA patterns (generic, after specific ones)
      /captcha/i,
      /verify you are human/i,
      /prove you are human/i,
      /complete the captcha/i,
      /security check/i,
      /security challenge/i,

      // General bot detection (before generic "challenge")
      /bot detected/i,
      /automated query/i,
      /too many requests/i,
      /rate limit exceeded/i,
      /access denied/i,
      /blocked/i,

      // Generic challenge patterns (after specific ones)
      /challenge/i,

      // Challenge page indicators
      /please complete the following/i,
      /confirm you are human/i,
      /are you a robot/i,
    ];

    const normalizedContent = pageContent.toLowerCase();

    for (const pattern of challengePatterns) {
      if (pattern.test(pageContent)) {
        const challengeType = this.mapPatternToType(pattern);
        this.logDetection(source, challengeType, pageContent);

        return {
          isBotDetected: true,
          challengeType,
          shouldRetry: this.canRetry(source),
          retryCount: this.getRetryCount(source),
        };
      }
    }

    return {
      isBotDetected: false,
      shouldRetry: false,
      retryCount: 0,
    };
  }

  /**
   * Detects bot challenge from page element selectors
   *
   * @param pageSelectors - Object containing page element information
   * @param source - The scraper source
   * @returns BotDetectionResult
   */
  detectBotChallengeFromSelectors(
    pageSelectors: {
      title?: string;
      bodyText?: string;
      selectors?: string[];
    },
    source: string
  ): BotDetectionResult {
    const challengeSelectors = [
      // Specific recaptcha selectors (must come before generic captcha)
      '#recaptcha',
      '.g-recaptcha',
      // Specific hcaptcha selectors
      '#hcaptcha',
      '.h-captcha',
      // Generic captcha selectors
      '#captcha',
      '.captcha',
      '[data-captcha]',
      // Challenge selectors
      '#challenge',
      '.challenge',
      '[data-challenge]',
      // Class-based selectors
      '[class*="captcha"]',
      '[class*="challenge"]',
      '[class*="bot"]',
      // ID-based selectors
      '[id*="captcha"]',
      '[id*="challenge"]',
      '[id*="bot"]',
    ];

    const combinedContent = [
      pageSelectors.title || '',
      pageSelectors.bodyText || '',
      ...(pageSelectors.selectors || []),
    ].join(' ');

    for (const selector of challengeSelectors) {
      if (combinedContent.includes(selector.replace(/[.#\[\]]/g, ''))) {
        const challengeType = this.mapSelectorToType(selector);
        this.logDetection(source, challengeType, combinedContent);

        return {
          isBotDetected: true,
          challengeType,
          shouldRetry: this.canRetry(source),
          retryCount: this.getRetryCount(source),
        };
      }
    }

    return {
      isBotDetected: false,
      shouldRetry: false,
      retryCount: 0,
    };
  }

  /**
   * Pauses execution for the configured retry delay
   *
   * @param source - The scraper source for logging
   * @returns Promise that resolves after the delay
   */
  async pauseForRetry(source: string): Promise<void> {
    console.log(`[BotDetection] ${source}: Pausing for ${this.config.retryDelayMs}ms before retry...`);
    await new Promise((resolve) => setTimeout(resolve, this.config.retryDelayMs));
  }

  /**
   * Increments the retry count for a source
   *
   * @param source - The scraper source
   * @returns The new retry count
   */
  incrementRetryCount(source: string): number {
    const currentCount = this.retryCounts.get(source) || 0;
    const newCount = currentCount + 1;
    this.retryCounts.set(source, newCount);
    return newCount;
  }

  /**
   * Resets the retry count for a source
   *
   * @param source - The scraper source
   */
  resetRetryCount(source: string): void {
    this.retryCounts.set(source, 0);
  }

  /**
   * Gets the current retry count for a source
   *
   * @param source - The scraper source
   * @returns The current retry count
   */
  getRetryCount(source: string): number {
    return this.retryCounts.get(source) || 0;
  }

  /**
   * Checks if retry is still allowed for a source
   *
   * @param source - The scraper source
   * @returns true if retry is allowed, false otherwise
   */
  canRetry(source: string): boolean {
    const count = this.getRetryCount(source);
    return count < this.config.maxRetries;
  }

  /**
   * Gets the detection log
   *
   * @returns Array of bot detection events
   */
  getDetectionLog(): BotDetectionEvent[] {
    return [...this.detectionLog];
  }

  /**
   * Clears the detection log
   */
  clearDetectionLog(): void {
    this.detectionLog = [];
    this.retryCounts.clear();
  }

  /**
   * Logs a bot detection event
   */
  private logDetection(source: string, challengeType: string, details?: string): void {
    const event: BotDetectionEvent = {
      timestamp: new Date(),
      source,
      challengeType,
      details,
    };
    this.detectionLog.push(event);
    console.log(`[BotDetection] Detected ${challengeType} from ${source} at ${event.timestamp.toISOString()}`);
  }

  /**
   * Maps a regex pattern to a challenge type string
   */
  private mapPatternToType(pattern: RegExp): string {
    const patternStr = pattern.toString().toLowerCase();

    // Check specific patterns first (order matters!)
    if (patternStr.includes('recaptcha') || patternStr.includes('google recaptcha') || patternStr.includes('g-recaptcha')) return 'recaptcha';
    if (patternStr.includes('hcaptcha')) return 'hcaptcha';
    if (patternStr.includes('cloudflare') || patternStr.includes('cf_chl') || patternStr.includes('cf_captcha')) return 'cloudflare';
    if (patternStr.includes('captcha') || patternStr.includes('verify you are human') || patternStr.includes('prove you are human') || patternStr.includes('complete the captcha') || patternStr.includes('security check') || patternStr.includes('security challenge')) return 'captcha';
    if (patternStr.includes('too many requests') || patternStr.includes('rate limit exceeded')) return 'rate_limit';
    if (patternStr.includes('challenge')) return 'challenge_page';
    if (patternStr.includes('bot') || patternStr.includes('automated query')) return 'rate_limit';
    return 'unknown_challenge';
  }

  /**
   * Maps a CSS selector to a challenge type string
   */
  private mapSelectorToType(selector: string): string {
    const selectorLower = selector.toLowerCase();

    // Check specific patterns first (order matters!)
    if (selectorLower.includes('g-recaptcha') || selectorLower.includes('recaptcha')) return 'recaptcha';
    if (selectorLower.includes('h-captcha') || selectorLower.includes('hcaptcha')) return 'hcaptcha';
    if (selectorLower.includes('captcha')) return 'captcha';
    if (selectorLower.includes('challenge')) return 'challenge_page';
    if (selectorLower.includes('bot')) return 'rate_limit';
    return 'unknown_challenge';
  }
}

/**
 * Factory function to create a bot detection service instance
 *
 * @param config - Optional configuration
 * @returns BotDetectionService instance
 */
export function createBotDetectionService(config?: BotDetectionConfig): BotDetectionService {
  return new BotDetectionService(config);
}
