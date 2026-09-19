/**
 * JWT test fixtures (LOC-0092)
 *
 * Throwaway RSA PEM pairs for session-token specs. Each call generates a
 * fresh pair, so a "foreign" pair is genuinely unrelated to the primary one.
 * Test-only: never imported by app code (it pulls node `crypto`, which the
 * Edge runtime cannot load).
 */

import { generateKeyPairSync } from "crypto";

export interface TestRsaPemPair {
  privateKey: string;
  publicKey: string;
}

export function generateTestRsaPemPair(): TestRsaPemPair {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}
