/**
 * Scraper Retry Utility
 *
 * Provides retry logic with exponential backoff for scraper operations.
 * Handles transient errors like network timeouts, rate limiting, and browser issues.
 */

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs?: number;
  /** Randomization factor between 0 and 1 (default: 0.1) */
  randomizationFactor?: number;
}

export interface RetryResult<T> {
  /** The result of the operation */
  result: T;
  /** Number of attempts made (including the successful one) */
  attempts: number;
  /** Total time spent in milliseconds */
  totalTimeMs: number;
  /** Whether the operation succeeded on first try */
  succeededOnFirstTry: boolean;
  /** Error messages from failed attempts (if any) */
  errorHistory: string[];
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly errorHistory: string[]
  ) {
    super(message);
    this.name = "RetryError";
  }
}

/**
 * Determines if an error is retryable based on error type and message
 */
export function isRetryableError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Network-related errors are retryable
  const networkErrors = [
    'timeout',
    'network',
    'connection refused',
    'connection reset',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'socket hang up',
    'premature close',
  ];

  // Rate limiting errors are retryable
  const rateLimitErrors = [
    'rate limit',
    'too many requests',
    '429',
    'busy',
    'throttl',
  ];

  // Browser-related transient errors are retryable
  const browserErrors = [
    'target closed',
    'page closed',
    'context closed',
    'browser disconnected',
    'navigation timeout',
    'neterror',
  ];

  // Check for non-retryable errors
  const nonRetryableErrors = [
    '404',
    'not found',
    '403',
    'forbidden',
    'authentication',
    'unauthorized',
    'invalid credentials',
  ];

  const lowerMessage = errorMessage.toLowerCase();

  // Check non-retryable first
  if (nonRetryableErrors.some(err => lowerMessage.includes(err))) {
    return false;
  }

  // Check retryable patterns
  return networkErrors.some(err => lowerMessage.includes(err)) ||
         rateLimitErrors.some(err => lowerMessage.includes(err)) ||
         browserErrors.some(err => lowerMessage.includes(err)) ||
         true; // Default to retryable for unknown errors
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  config: Required<RetryConfig>
): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add randomization (jitter) to prevent thundering herd
  const jitter = cappedDelay * config.randomizationFactor * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(cappedDelay + jitter));
}

/**
 * Execute an operation with retry logic
 *
 * @param operation - The async operation to retry
 * @param config - Retry configuration
 * @returns Promise resolving to RetryResult with the operation result
 * @throws RetryError if all retries are exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {}
): Promise<RetryResult<T>> {
  const retryConfig: Required<RetryConfig> = {
    maxRetries: config.maxRetries ?? 3,
    initialDelayMs: config.initialDelayMs ?? 1000,
    backoffMultiplier: config.backoffMultiplier ?? 2,
    maxDelayMs: config.maxDelayMs ?? 10000,
    randomizationFactor: config.randomizationFactor ?? 0.1,
  };

  const startTime = Date.now();
  const errorHistory: string[] = [];

  for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
    try {
      const result = await operation();
      return {
        result,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
        succeededOnFirstTry: attempt === 1,
        errorHistory,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorHistory.push(`Attempt ${attempt}: ${errorMessage}`);

      // Check if error is retryable
      if (!isRetryableError(error)) {
        throw new RetryError(
          `Non-retryable error: ${errorMessage}`,
          attempt,
          errorHistory
        );
      }

      // If this was the last attempt, throw
      if (attempt === retryConfig.maxRetries + 1) {
        throw new RetryError(
          `Operation failed after ${attempt - 1} retries: ${errorMessage}`,
          attempt - 1,
          errorHistory
        );
      }

      // Wait before retrying
      const delay = calculateDelay(attempt, retryConfig);
      console.log(`Scraper retry: attempt ${attempt + 1} in ${delay}ms (error: ${errorMessage})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new RetryError(
    'Unexpected retry loop exit',
    retryConfig.maxRetries,
    errorHistory
  );
}

/**
 * Retry wrapper for scraper page navigation
 */
export async function retryPageNavigation(
  navigationFn: () => Promise<void>,
  maxRetries = 2
): Promise<void> {
  await withRetry(navigationFn, {
    maxRetries,
    initialDelayMs: 2000,
    backoffMultiplier: 2,
    maxDelayMs: 8000,
  });
}

/**
 * Retry wrapper for scraper data extraction
 */
export async function retryDataExtraction<T>(
  extractionFn: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  const result = await withRetry(extractionFn, {
    maxRetries,
    initialDelayMs: 1000,
    backoffMultiplier: 1.5,
    maxDelayMs: 5000,
  });
  return result.result;
}
