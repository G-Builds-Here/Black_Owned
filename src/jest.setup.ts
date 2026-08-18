// Polyfill for Web APIs in Node.js test environment
import 'whatwg-fetch';

// Make Request, Response, Headers globally available
(global as any).Request = (global as any).Request || (fetch as any).Request;
(global as any).Response = (global as any).Response || (fetch as any).Response;
(global as any).Headers = (global as any).Headers || (fetch as any).Headers;
