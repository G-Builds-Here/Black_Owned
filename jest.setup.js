// Polyfill for Web APIs in Node.js test environment
// Force global Request/Response/Headers for jsdom environment
const { Request: NodeRequest, Response: NodeResponse, Headers: NodeHeaders } = require('undici');

global.Request = NodeRequest;
global.Response = NodeResponse;
global.Headers = NodeHeaders;

// Import testing library after polyfills
import '@testing-library/jest-dom';
