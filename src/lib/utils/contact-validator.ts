/**
 * Contact data validation and sanitization utilities
 *
 * Provides validation for phone numbers, email addresses, and website URLs
 * extracted from business listings.
 */

/**
 * Phone number validation regex
 * Matches:
 * - US formats: 555-123-4567, (555) 123-4567, 5551234567, 1-555-123-4567
 * - International: +44 20 7946 0958, +33 1 23 45 67 89
 */
const PHONE_REGEX = /^(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$|^\+\d{1,3}[\s-]?(\d[\s-]?){6,14}\d$/;

/**
 * Email validation regex
 * Matches standard email format with proper domain validation
 */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Website URL validation regex
 * Matches http/https URLs with valid domain structure
 */
const URL_REGEX = /^https?:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(\/[^\s]*)?$/;

/**
 * Validate phone number format
 * @param phone - Phone number to validate (optional field)
 * @returns true if valid or undefined/null, false if invalid format
 */
export function validatePhoneNumber(phone: string | undefined | null): boolean {
  if (!phone || phone.trim() === '') {
    return true; // Optional field
  }
  return PHONE_REGEX.test(phone.trim());
}

/**
 * Validate email address format
 * @param email - Email address to validate (optional field)
 * @returns true if valid or undefined/null, false if invalid format
 */
export function validateEmail(email: string | undefined | null): boolean {
  if (!email || email.trim() === '') {
    return true; // Optional field
  }
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Validate website URL format
 * @param url - Website URL to validate (optional field)
 * @returns true if valid or undefined/null, false if invalid format
 */
export function validateWebsiteUrl(url: string | undefined | null): boolean {
  if (!url || url.trim() === '') {
    return true; // Optional field
  }
  return URL_REGEX.test(url.trim());
}

/**
 * Sanitize phone number to digits only (preserves country code)
 * @param phone - Raw phone number string
 * @returns Normalized phone number or undefined if invalid
 */
export function sanitizePhoneNumber(phone: string | undefined | null): string | undefined {
  if (!phone || phone.trim() === '') {
    return undefined;
  }

  const cleaned = phone.replace(/[^\d+]/g, '');

  // Remove leading + for digit extraction
  const digitsOnly = cleaned.replace('+', '');

  // Must have at least 7 digits (minimum valid phone)
  if (digitsOnly.length < 7) {
    return undefined;
  }

  return digitsOnly;
}

/**
 * Sanitize email address to lowercase
 * @param email - Raw email address string
 * @returns Normalized email or undefined if invalid
 */
export function sanitizeEmail(email: string | undefined | null): string | undefined {
  if (!email || email.trim() === '') {
    return undefined;
  }

  const trimmed = email.trim().toLowerCase();

  if (!EMAIL_REGEX.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

/**
 * Sanitize website URL to consistent format
 * @param url - Raw URL string
 * @returns Normalized URL with https or undefined if invalid
 */
export function sanitizeWebsiteUrl(url: string | undefined | null): string | undefined {
  if (!url || url.trim() === '') {
    return undefined;
  }

  const trimmed = url.trim();

  // Reject dangerous protocols
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) {
    return undefined;
  }

  // Add https if missing
  let normalized = trimmed;
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }

  if (!URL_REGEX.test(normalized)) {
    return undefined;
  }

  return normalized;
}

/**
 * Contact validation result type
 */
export interface ContactValidationResult {
  isValid: boolean;
  errors: string[];
  sanitized: {
    phone?: string;
    email?: string;
    website?: string;
  };
}

/**
 * Validate and sanitize all contact fields at once
 * @param contact - Object containing phone, email, and/or website
 * @returns Validation result with errors and sanitized values
 */
export function validateContactFields(contact: {
  phone?: string;
  email?: string;
  website?: string;
}): ContactValidationResult {
  const errors: string[] = [];
  const sanitized: ContactValidationResult['sanitized'] = {};

  // Validate and sanitize phone
  if (contact.phone) {
    if (!validatePhoneNumber(contact.phone)) {
      errors.push(`Invalid phone format: ${contact.phone}`);
    } else {
      const sanitizedPhone = sanitizePhoneNumber(contact.phone);
      if (sanitizedPhone) {
        sanitized.phone = sanitizedPhone;
      }
    }
  }

  // Validate and sanitize email
  if (contact.email) {
    if (!validateEmail(contact.email)) {
      errors.push(`Invalid email format: ${contact.email}`);
    } else {
      const sanitizedEmail = sanitizeEmail(contact.email);
      if (sanitizedEmail) {
        sanitized.email = sanitizedEmail;
      }
    }
  }

  // Validate and sanitize website
  if (contact.website) {
    if (!validateWebsiteUrl(contact.website)) {
      errors.push(`Invalid website URL: ${contact.website}`);
    } else {
      const sanitizedUrl = sanitizeWebsiteUrl(contact.website);
      if (sanitizedUrl) {
        sanitized.website = sanitizedUrl;
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized,
  };
}
