import '@testing-library/jest-dom';

// Polyfill for TextEncoder/TextDecoder required by pg module in Node 18+
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
