/**
 * Bot Detection Service Tests
 */

import { BotDetectionService, createBotDetectionService, BotDetectionEvent } from './bot-detection-service';

describe('BotDetectionService', () => {
  let service: BotDetectionService;

  beforeEach(() => {
    service = createBotDetectionService();
  });

  afterEach(() => {
    service.clearDetectionLog();
  });

  describe('detectBotChallenge', () => {
    it('should detect CAPTCHA in page content', () => {
      const pageContent = '<html><body>Please complete the captcha to continue</body></html>';
      const result = service.detectBotChallenge(pageContent, 'yelp');

      expect(result.isBotDetected).toBe(true);
      expect(result.challengeType).toBe('captcha');
    });

    it('should detect Cloudflare challenge', () => {
      const pageContent = '<html><body>Checking your browser before accessing cloudflare</body></html>';
      const result = service.detectBotChallenge(pageContent, 'facebook');

      expect(result.isBotDetected).toBe(true);
      expect(result.challengeType).toBe('cloudflare');
    });

    it('should detect reCAPTCHA', () => {
      const pageContent = '<html><body><div class="g-recaptcha"></div></body></html>';
      const result = service.detectBotChallenge(pageContent, 'google-maps');

      expect(result.isBotDetected).toBe(true);
      expect(result.challengeType).toBe('recaptcha');
    });

    it('should detect rate limiting', () => {
      const pageContent = '<html><body>Rate limit exceeded. Too many requests.</body></html>';
      const result = service.detectBotChallenge(pageContent, 'yelp');

      expect(result.isBotDetected).toBe(true);
      expect(result.challengeType).toBe('rate_limit');
    });

    it('should detect security challenge', () => {
      const pageContent = '<html><body>Security check required. Verify you are human.</body></html>';
      const result = service.detectBotChallenge(pageContent, 'facebook');

      expect(result.isBotDetected).toBe(true);
      expect(result.challengeType).toBe('captcha');
    });

    it('should return no detection for normal content', () => {
      const pageContent = '<html><body><h1>Business Results</h1><div>Restaurant A</div></body></html>';
      const result = service.detectBotChallenge(pageContent, 'yelp');

      expect(result.isBotDetected).toBe(false);
      expect(result.shouldRetry).toBe(false);
    });

    it('should log detection event', () => {
      const pageContent = '<html><body>Captcha required</body></html>';
      service.detectBotChallenge(pageContent, 'test-source');

      const log = service.getDetectionLog();
      expect(log.length).toBe(1);
      expect(log[0].source).toBe('test-source');
      expect(log[0].challengeType).toBe('captcha');
      expect(log[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('detectBotChallengeFromSelectors', () => {
    it('should detect captcha selector', () => {
      const selectors = {
        title: 'Page Title',
        bodyText: 'Some content',
        selectors: ['#captcha', '.business-results'],
      };
      const result = service.detectBotChallengeFromSelectors(selectors, 'yelp');

      expect(result.isBotDetected).toBe(true);
      expect(result.challengeType).toBe('captcha');
    });

    it('should detect recaptcha selector', () => {
      const selectors = {
        title: 'Page Title',
        selectors: ['.g-recaptcha'],
      };
      const result = service.detectBotChallengeFromSelectors(selectors, 'google-maps');

      expect(result.isBotDetected).toBe(true);
      expect(result.challengeType).toBe('recaptcha');
    });

    it('should detect challenge selector', () => {
      const selectors = {
        bodyText: 'Complete the challenge',
        selectors: ['#challenge-form'],
      };
      const result = service.detectBotChallengeFromSelectors(selectors, 'facebook');

      expect(result.isBotDetected).toBe(true);
      expect(result.challengeType).toBe('challenge_page');
    });

    it('should return no detection when no challenge selectors found', () => {
      const selectors = {
        title: 'Search Results',
        selectors: ['.business-list', '.result-item'],
      };
      const result = service.detectBotChallengeFromSelectors(selectors, 'yelp');

      expect(result.isBotDetected).toBe(false);
    });
  });

  describe('pauseForRetry', () => {
    it('should pause for the configured delay', async () => {
      const shortDelayService = createBotDetectionService({ retryDelayMs: 100 });
      const startTime = Date.now();

      await shortDelayService.pauseForRetry('test-source');

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });

    it('should log the pause action', async () => {
      const shortDelayService = createBotDetectionService({ retryDelayMs: 50 });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await shortDelayService.pauseForRetry('test-source');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Pausing for 50ms before retry')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('retry count management', () => {
    it('should increment retry count', () => {
      expect(service.getRetryCount('test-source')).toBe(0);

      const count1 = service.incrementRetryCount('test-source');
      expect(count1).toBe(1);
      expect(service.getRetryCount('test-source')).toBe(1);

      const count2 = service.incrementRetryCount('test-source');
      expect(count2).toBe(2);
    });

    it('should track retry counts per source independently', () => {
      service.incrementRetryCount('source-a');
      service.incrementRetryCount('source-a');
      service.incrementRetryCount('source-b');

      expect(service.getRetryCount('source-a')).toBe(2);
      expect(service.getRetryCount('source-b')).toBe(1);
    });

    it('should reset retry count', () => {
      service.incrementRetryCount('test-source');
      service.incrementRetryCount('test-source');
      expect(service.getRetryCount('test-source')).toBe(2);

      service.resetRetryCount('test-source');
      expect(service.getRetryCount('test-source')).toBe(0);
    });

    it('should allow retry when under max retries', () => {
      service.incrementRetryCount('test-source');
      service.incrementRetryCount('test-source');

      expect(service.canRetry('test-source')).toBe(true);
    });

    it('should not allow retry when max retries exceeded', () => {
      const limitedService = createBotDetectionService({ maxRetries: 2 });

      limitedService.incrementRetryCount('test-source');
      limitedService.incrementRetryCount('test-source');

      expect(limitedService.canRetry('test-source')).toBe(false);
    });

    it('should return correct retry count from detectBotChallenge', () => {
      service.incrementRetryCount('test-source');

      const result = service.detectBotChallenge('captcha test', 'test-source');
      expect(result.retryCount).toBe(1);
    });
  });

  describe('detection log management', () => {
    it('should clear detection log', () => {
      service.detectBotChallenge('captcha', 'source-a');
      service.detectBotChallenge('cloudflare', 'source-b');

      expect(service.getDetectionLog().length).toBe(2);

      service.clearDetectionLog();
      expect(service.getDetectionLog().length).toBe(0);
    });

    it('should return a copy of the log', () => {
      service.detectBotChallenge('captcha', 'source-a');

      const log1 = service.getDetectionLog();
      const log2 = service.getDetectionLog();

      expect(log1).not.toBe(log2);
    });
  });

  describe('shouldRetry flag', () => {
    it('should set shouldRetry to true when under max retries', () => {
      const result = service.detectBotChallenge('captcha', 'test-source');
      expect(result.shouldRetry).toBe(true);
    });

    it('should set shouldRetry to false when max retries exceeded', () => {
      const limitedService = createBotDetectionService({ maxRetries: 1 });

      limitedService.incrementRetryCount('test-source');
      const result = limitedService.detectBotChallenge('captcha', 'test-source');

      expect(result.shouldRetry).toBe(false);
    });
  });

  describe('custom configuration', () => {
    it('should use custom retry delay', () => {
      const customService = createBotDetectionService({ retryDelayMs: 5000 });
      expect(customService.getRetryCount('test')).toBe(0);
    });

    it('should use custom max retries', () => {
      const customService = createBotDetectionService({ maxRetries: 5 });

      customService.incrementRetryCount('test');
      customService.incrementRetryCount('test');
      customService.incrementRetryCount('test');

      expect(customService.canRetry('test')).toBe(true);
    });
  });
});
