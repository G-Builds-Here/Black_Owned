/**
 * Services Module Exports
 */

export {
  BotDetectionService,
  createBotDetectionService,
  type BotDetectionConfig,
  type BotDetectionEvent,
  type BotDetectionResult,
} from './bot-detection-service';

export {
  DuplicateDetectionService,
  createDuplicateDetectionService,
} from './duplicate-detection-service';

export {
  FacebookScraper,
} from './facebook-scraper';

export {
  GoogleMapsScraper,
} from './google-maps-scraper';

export {
  ImageService,
} from './image-service';

export {
  ReviewService,
} from './review-service';

export {
  YelpScraper,
  createYelpScraper,
} from './yelp-scraper';
