/**
 * Business duplicate detection tests
 */

import { normalizePhoneNumber } from "./business-repository";

describe("normalizePhoneNumber", () => {
  it("should remove all non-digit characters", () => {
    expect(normalizePhoneNumber("(555) 123-4567")).toBe("5551234567");
  });

  it("should handle phone with dashes", () => {
    expect(normalizePhoneNumber("555-123-4567")).toBe("5551234567");
  });

  it("should handle phone with country code", () => {
    expect(normalizePhoneNumber("+1-555-123-4567")).toBe("15551234567");
  });

  it("should handle already normalized phone", () => {
    expect(normalizePhoneNumber("5551234567")).toBe("5551234567");
  });

  it("should trim whitespace", () => {
    expect(normalizePhoneNumber("  (555) 123-4567  ")).toBe("5551234567");
  });

  it("should handle empty string", () => {
    expect(normalizePhoneNumber("")).toBe("");
  });

  it("should handle phone with spaces and parentheses", () => {
    expect(normalizePhoneNumber("555 123 4567")).toBe("5551234567");
  });
});
