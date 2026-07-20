/**
 * User Types Tests
 */

import { validatePassword, isValidEmail } from "./user";

describe("validatePassword", () => {
  it("should validate a strong password", () => {
    const result = validatePassword("SecurePass123!");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should reject password shorter than 8 characters", () => {
    const result = validatePassword("Short1!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must be at least 8 characters long");
  });

  it("should reject password without uppercase", () => {
    const result = validatePassword("securepass123!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must contain at least one uppercase letter");
  });

  it("should reject password without lowercase", () => {
    const result = validatePassword("SECUREPASS123!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must contain at least one lowercase letter");
  });

  it("should reject password without digit", () => {
    const result = validatePassword("SecurePass!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must contain at least one digit");
  });

  it("should reject password without special character", () => {
    const result = validatePassword("SecurePass123");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must contain at least one special character");
  });

  it("should reject very weak password", () => {
    const result = validatePassword("weak");
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(4);
  });
});

describe("isValidEmail", () => {
  it("should validate correct email format", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("test.user@domain.org")).toBe(true);
    expect(isValidEmail("user+tag@example.co.uk")).toBe(true);
  });

  it("should reject invalid email format", () => {
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("user@domain")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});
