// Polyfill for Web APIs in Node.js test environment
import 'whatwg-fetch';

// Make Request, Response, Headers globally available
global.Request = global.Request || fetch.Request;
global.Response = global.Response || fetch.Response;
global.Headers = global.Headers || fetch.Headers;
