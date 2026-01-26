import '@testing-library/jest-dom';

// Polyfill crypto.randomUUID for Jest (JSDOM / Node < 19)
import { randomUUID } from 'crypto';

(globalThis as any).crypto = (globalThis as any).crypto || {};
if (!(globalThis as any).crypto.randomUUID) {
  (globalThis as any).crypto.randomUUID = randomUUID;
}
