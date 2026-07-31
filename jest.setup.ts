import '@testing-library/jest-dom';

// Polyfill for TextEncoder/TextDecoder (required by some Node.js modules in Jest)
import { TextEncoder, TextDecoder } from 'util';
// @ts-ignore - type compatibility issue with Node.js polyfills
global.TextEncoder = TextEncoder;
// @ts-ignore - type compatibility issue with Node.js polyfills
global.TextDecoder = TextDecoder;
