/**
 * Business Types
 *
 * Defines the data structures for business profiles.
 */

/**
 * Verification status for a business
 */
export type VerificationStatus = "unverified" | "pending" | "pending_review" | "verified";

/**
 * Business entity stored in PostgreSQL
 */
export interface Business {
  id: string;
  ownerId: string;
  name: string;
  description: string | undefined;
  categoryId: string;
  verificationStatus: VerificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Standard business hours format
 * Each day has optional open and close times in HH:MM format
 */
export interface BusinessHoursDay {
  open?: string;
  close?: string;
}

/**
 * Business hours for the entire week
 */
export interface BusinessHours {
  monday: BusinessHoursDay;
  tuesday: BusinessHoursDay;
  wednesday: BusinessHoursDay;
  thursday: BusinessHoursDay;
  friday: BusinessHoursDay;
  saturday: BusinessHoursDay;
  sunday: BusinessHoursDay;
}

/**
 * Business category tags
 */
export type BusinessCategory =
  | "food-dining"
  | "professional-services"
  | "retail-fashion"
  | "health-wellness"
  | "automotive"
  | "home-services"
  | "entertainment"
  | "education"
  | "financial-services"
  | "other";

/**
 * Business profile data structure
 */
export interface BusinessProfile {
  id?: string;
  name: string;
  description?: string;
  hours: BusinessHours;
  categories: BusinessCategory[];
  verificationStatus: VerificationStatus;
  imageUrl?: string;
}

/**
 * Validates business hours format (HH:MM)
 */
export function isValidTimeFormat(time: string): boolean {
  const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  return timeRegex.test(time);
}

/**
 * Validates a business profile against schema requirements
 */
export function validateBusinessProfile(profile: BusinessProfile): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields
  if (!profile.name || profile.name.trim() === "") {
    errors.push("Missing required field: name");
  }

  // Verification status must be valid
  const validVerificationStatuses: VerificationStatus[] = ["unverified", "pending", "verified"];
  if (!validVerificationStatuses.includes(profile.verificationStatus)) {
    errors.push(`Invalid verificationStatus: ${profile.verificationStatus} (must be one of: unverified, pending, verified)`);
  }

  // Validate hours format
  const days: (keyof BusinessHours)[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  for (const day of days) {
    const dayHours = profile.hours[day];
    if (dayHours.open && !isValidTimeFormat(dayHours.open)) {
      errors.push(`Invalid open time for ${day}: ${dayHours.open} (must be HH:MM format)`);
    }
    if (dayHours.close && !isValidTimeFormat(dayHours.close)) {
      errors.push(`Invalid close time for ${day}: ${dayHours.close} (must be HH:MM format)`);
    }
  }

  // Validate categories
  const validCategories: BusinessCategory[] = [
    "food-dining",
    "professional-services",
    "retail-fashion",
    "health-wellness",
    "automotive",
    "home-services",
    "entertainment",
    "education",
    "financial-services",
    "other",
  ];
  for (const category of profile.categories) {
    if (!validCategories.includes(category)) {
      errors.push(`Invalid category: ${category}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates a default business hours object with all days closed
 */
export function getDefaultBusinessHours(): BusinessHours {
  return {
    monday: {},
    tuesday: {},
    wednesday: {},
    thursday: {},
    friday: {},
    saturday: {},
    sunday: {},
  };
}
