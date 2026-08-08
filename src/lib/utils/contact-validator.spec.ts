/**
 * Contact data validation and sanitization tests
 */

import {
  validatePhoneNumber,
  validateEmail,
  validateWebsiteUrl,
  sanitizePhoneNumber,
  sanitizeEmail,
  sanitizeWebsiteUrl,
  validateContactFields,
} from "./contact-validator";

describe("validatePhoneNumber", () => {
  it("accepts valid US phone numbers", () => {
    expect(validatePhoneNumber("555-123-4567")).toBe(true);
    expect(validatePhoneNumber("(555) 123-4567")).toBe(true);
    expect(validatePhoneNumber("5551234567")).toBe(true);
    expect(validatePhoneNumber("+1 555-123-4567")).toBe(true);
    expect(validatePhoneNumber("1-555-123-4567")).toBe(true);
  });

  it("accepts valid international phone numbers", () => {
    expect(validatePhoneNumber("+44 20 7946 0958")).toBe(true);
    expect(validatePhoneNumber("+33 1 23 45 67 89")).toBe(true);
  });

  it("rejects invalid phone numbers", () => {
    expect(validatePhoneNumber("abc-def-ghij")).toBe(false);
  });

  it("handles undefined and null", () => {
    expect(validatePhoneNumber(undefined)).toBe(true); // Optional field
    expect(validatePhoneNumber(null)).toBe(true); // Optional field
    expect(validatePhoneNumber("")).toBe(true); // Empty string is valid (optional field)
  });
});

describe("validateEmail", () => {
  it("accepts valid email addresses", () => {
    expect(validateEmail("user@example.com")).toBe(true);
    expect(validateEmail("user.name@example.com")).toBe(true);
    expect(validateEmail("user+tag@example.co.uk")).toBe(true);
    expect(validateEmail("user@subdomain.example.com")).toBe(true);
    expect(validateEmail("user123@company.io")).toBe(true);
  });

  it("rejects invalid email addresses", () => {
    expect(validateEmail("invalid")).toBe(false);
    expect(validateEmail("missing@domain")).toBe(false);
    expect(validateEmail("@example.com")).toBe(false);
    expect(validateEmail("user@")).toBe(false);
    expect(validateEmail("user @example.com")).toBe(false);
  });

  it("handles undefined and null", () => {
    expect(validateEmail(undefined)).toBe(true); // Optional field
    expect(validateEmail(null)).toBe(true); // Optional field
    expect(validateEmail("")).toBe(true); // Empty string is valid (optional field)
  });
});

describe("validateWebsiteUrl", () => {
  it("accepts valid URLs", () => {
    expect(validateWebsiteUrl("https://example.com")).toBe(true);
    expect(validateWebsiteUrl("http://example.com")).toBe(true);
    expect(validateWebsiteUrl("https://www.example.com")).toBe(true);
    expect(validateWebsiteUrl("https://example.com/path")).toBe(true);
    expect(validateWebsiteUrl("https://subdomain.example.com")).toBe(true);
  });

  it("rejects invalid URLs", () => {
    expect(validateWebsiteUrl("not-a-url")).toBe(false);
    expect(validateWebsiteUrl("ftp://example.com")).toBe(false);
    expect(validateWebsiteUrl("javascript:alert(1)")).toBe(false);
  });

  it("handles undefined and null", () => {
    expect(validateWebsiteUrl(undefined)).toBe(true); // Optional field
    expect(validateWebsiteUrl(null)).toBe(true); // Optional field
    expect(validateWebsiteUrl("")).toBe(true); // Empty string is valid (optional field)
  });
});

describe("sanitizePhoneNumber", () => {
  it("normalizes US phone numbers to digits only", () => {
    expect(sanitizePhoneNumber("555-123-4567")).toBe("5551234567");
    expect(sanitizePhoneNumber("(555) 123-4567")).toBe("5551234567");
    expect(sanitizePhoneNumber("555.123.4567")).toBe("5551234567");
    expect(sanitizePhoneNumber("5551234567")).toBe("5551234567");
  });

  it("preserves country code in international numbers", () => {
    expect(sanitizePhoneNumber("+1 555-123-4567")).toBe("15551234567");
    expect(sanitizePhoneNumber("+44 20 7946 0958")).toBe("442079460958");
  });

  it("returns undefined for invalid input", () => {
    expect(sanitizePhoneNumber("abc")).toBeUndefined();
    expect(sanitizePhoneNumber("")).toBeUndefined();
    expect(sanitizePhoneNumber(undefined)).toBeUndefined();
    expect(sanitizePhoneNumber("123")).toBeUndefined(); // Too short
  });
});

describe("sanitizeEmail", () => {
  it("normalizes email addresses to lowercase", () => {
    expect(sanitizeEmail("User@Example.COM")).toBe("user@example.com");
    expect(sanitizeEmail("USER@EXAMPLE.COM")).toBe("user@example.com");
  });

  it("trims whitespace", () => {
    expect(sanitizeEmail("  user@example.com  ")).toBe("user@example.com");
  });

  it("returns undefined for invalid input", () => {
    expect(sanitizeEmail("invalid")).toBeUndefined();
    expect(sanitizeEmail("")).toBeUndefined();
    expect(sanitizeEmail(undefined)).toBeUndefined();
  });
});

describe("sanitizeWebsiteUrl", () => {
  it("adds https protocol if missing", () => {
    expect(sanitizeWebsiteUrl("example.com")).toBe("https://example.com");
    expect(sanitizeWebsiteUrl("www.example.com")).toBe("https://www.example.com");
  });

  it("preserves existing protocol", () => {
    expect(sanitizeWebsiteUrl("https://example.com")).toBe("https://example.com");
    expect(sanitizeWebsiteUrl("http://example.com")).toBe("http://example.com");
  });

  it("trims whitespace", () => {
    expect(sanitizeWebsiteUrl("  https://example.com  ")).toBe("https://example.com");
  });

  it("returns undefined for invalid input", () => {
    expect(sanitizeWebsiteUrl("not-a-url")).toBeUndefined();
    expect(sanitizeWebsiteUrl("")).toBeUndefined();
    expect(sanitizeWebsiteUrl(undefined)).toBeUndefined();
  });
});

describe("validateContactFields", () => {
  it("validates all contact fields", () => {
    const result = validateContactFields({
      phone: "555-123-4567",
      email: "test@example.com",
      website: "https://example.com",
    });

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.sanitized.phone).toBe("5551234567");
    expect(result.sanitized.email).toBe("test@example.com");
    expect(result.sanitized.website).toBe("https://example.com");
  });

  it("collects validation errors", () => {
    const result = validateContactFields({
      phone: "invalid-phone",
      email: "invalid-email",
      website: "not-a-url",
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(3);
    expect(result.sanitized.phone).toBeUndefined();
    expect(result.sanitized.email).toBeUndefined();
    expect(result.sanitized.website).toBeUndefined();
  });

  it("handles partial contact info", () => {
    const result = validateContactFields({
      phone: "555-123-4567",
    });

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.sanitized.phone).toBe("5551234567");
    expect(result.sanitized.email).toBeUndefined();
    expect(result.sanitized.website).toBeUndefined();
  });
});
