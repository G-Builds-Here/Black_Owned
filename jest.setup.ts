import '@testing-library/jest-dom';

// Polyfill for TextEncoder/TextDecoder (required by pg package)
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
