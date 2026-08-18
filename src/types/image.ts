/**
 * Image Types
 *
 * Defines the data structures for business images stored in MinIO.
 */

export interface Image {
  id: string;
  businessId: string;
  imageUrl: string;
  altText: string;
  uploadDate: Date;
  category: string;
}

/**
 * Image category definitions with associated alt text patterns
 */
export interface ImageCategoryConfig {
  category: string;
  altTextTemplates: string[];
  imageCountMin: number;
  imageCountMax: number;
}

/**
 * Category-specific image configurations for realistic alt text generation
 */
export const IMAGE_CATEGORY_CONFIGS: Record<string, ImageCategoryConfig> = {
  restaurants: {
    category: "restaurants",
    altTextTemplates: [
      "Interior dining room with warm lighting and wooden tables",
      "Signature dish presentation on ceramic plate",
      "Chef preparing fresh ingredients in open kitchen",
      "Outdoor patio seating with string lights",
      "Bar area with craft cocktails and wine selection",
    ],
    imageCountMin: 2,
    imageCountMax: 4,
  },
  retail: {
    category: "retail",
    altTextTemplates: [
      "Storefront with welcoming entrance and display windows",
      "Product display shelves with organized merchandise",
      "Checkout counter with friendly staff",
      "Interior shopping area with bright lighting",
      "Seasonal promotion display near entrance",
    ],
    imageCountMin: 2,
    imageCountMax: 4,
  },
  "professional services": {
    category: "professional services",
    altTextTemplates: [
      "Professional office reception area",
      "Conference room with modern furnishings",
      "Team members in business attire collaborating",
      "Office building exterior with signage",
      "Client consultation space with comfortable seating",
    ],
    imageCountMin: 2,
    imageCountMax: 4,
  },
  "health/wellness": {
    category: "health/wellness",
    altTextTemplates: [
      "Clean and calming treatment room",
      "Reception area with soothing decor",
      "Professional equipment in sterile environment",
      "Wellness consultation space",
      "Relaxing waiting area with natural light",
    ],
    imageCountMin: 2,
    imageCountMax: 4,
  },
  beauty: {
    category: "beauty",
    altTextTemplates: [
      "Modern salon styling stations with mirrors",
      "Spa treatment room with calming ambiance",
      "Product display with premium beauty brands",
      "Stylist working with client",
      "Relaxing manicure/pedicure area",
    ],
    imageCountMin: 2,
    imageCountMax: 4,
  },
  "home services": {
    category: "home services",
    altTextTemplates: [
      "Professional service vehicle with company branding",
      "Technician working on residential system",
      "Before and after service comparison",
      "Professional tools and equipment",
      "Satisfied homeowner with completed work",
    ],
    imageCountMin: 2,
    imageCountMax: 4,
  },
  entertainment: {
    category: "entertainment",
    altTextTemplates: [
      "Venue interior with stage and seating",
      "Live performance in progress",
      "Bar and lounge area with ambient lighting",
      "Event setup with decorations",
      "Crowd enjoying the experience",
    ],
    imageCountMin: 2,
    imageCountMax: 4,
  },
  fitness: {
    category: "fitness",
    altTextTemplates: [
      "Modern gym equipment in clean facility",
      "Group fitness class in session",
      "Personal training session",
      "Spacious workout floor with mirrors",
      "Recovery and stretching area",
    ],
    imageCountMin: 2,
    imageCountMax: 4,
  },
  education: {
    category: "education",
    altTextTemplates: [
      "Classroom with learning materials and desks",
      "Instructor teaching small group session",
      "Study area with computers and resources",
      "Educational posters and visual aids",
      "Student collaboration space",
    ],
    imageCountMin: 2,
    imageCountMax: 4,
  },
  automotive: {
    category: "automotive",
    altTextTemplates: [
      "Service bay with vehicle on lift",
      "Professional mechanic at work",
      "Clean waiting area with amenities",
      "Modern diagnostic equipment",
      "Completed vehicle ready for pickup",
    ],
    imageCountMin: 2,
    imageCountMax: 4,
  },
};

/**
 * Business image data for seeding
 */
export interface BusinessImageData {
  businessId: string;
  businessName: string;
  category: string;
  images: Image[];
}
