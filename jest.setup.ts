import '@testing-library/jest-dom';

// Polyfill for TextEncoder/TextDecoder (required by some Node.js modules in Jest)
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock scrollIntoView for testing environments
if (typeof HTMLElement !== 'undefined') {
  HTMLElement.prototype.scrollIntoView = jest.fn();
}
