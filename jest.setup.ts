import '@testing-library/jest-dom';

// Polyfill for TextEncoder/TextDecoder (required by node-fetch and some packages)
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;
