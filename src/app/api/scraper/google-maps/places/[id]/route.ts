/**
 * Google Maps Place Details API Route
 *
 * GET /api/scraper/google-maps/places/:id
 * Returns detailed information for a specific Google Maps place.
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleMapsScraper } from "@/services/google-maps-scraper";
import { PlaceDetails } from "@/types/google-maps-scraper";

/**
 * Extract detailed place information from a Google Maps page
 */
async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const scraper = new GoogleMapsScraper();

  try {
    // Build the place details URL
    const placeUrl = `https://www.google.com/maps/place/?q=place_id:${placeId}`;

    await scraper["initialize"]();
    const context = scraper["context"];

    if (!context) {
      throw new Error("Browser context not initialized");
    }

    const page = await context.newPage();

    try {
      // Navigate to the place details page
      await page.goto(placeUrl, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Wait for place details to load
      try {
        await page.waitForSelector(
          '[data-place-id], [role="main"], .section-hero, [data-testid="place-attribution"]',
          { timeout: 10000 }
        );
      } catch {
        // Continue even if selector not found
      }

      // Extract place details using browser evaluation
      const placeData = await page.evaluate(() => {
        const extractText = (selector: string): string | undefined => {
          const el = document.querySelector(selector);
          return el?.textContent?.trim() || undefined;
        };

        const findAttribute = (
          container: Element,
          attribute: string
        ): string | undefined => {
          const el = container.querySelector(`[aria-label*="${attribute}"]`);
          return el?.getAttribute("aria-label") || undefined;
        };

        // Try to find the main place container
        const placeContainer =
          document.querySelector('[data-place-id]') ||
          document.querySelector('[role="main"]') ||
          document.querySelector(".section-hero") ||
          document.body;

        // Extract basic information
        const nameEl = placeContainer.querySelector(
          "h1, .section-hero-title, [data-testid='place-title']"
        );
        const name = nameEl?.textContent?.trim();

        // Extract address
        const addressEl = placeContainer.querySelector(
          '[aria-label*="address"], [data-testid="place-address"], .section-addr'
        );
        const address = addressEl?.textContent?.trim();

        // Extract rating
        const ratingEl = placeContainer.querySelector(
          '[aria-label*="star"], [data-testid="place-rating"]'
        );
        const ratingText = ratingEl?.getAttribute("aria-label") || "";
        const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

        // Extract review count
        const reviewEl = placeContainer.querySelector(
          '[aria-label*="review"], [data-testid="place-review-count"]'
        );
        const reviewText = reviewEl?.textContent || "";
        const reviewMatch = reviewText.match(/(\d+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1], 10) : undefined;

        // Extract phone
        const phoneEl = placeContainer.querySelector(
          '[aria-label*="phone"], [data-testid="place-phone"], a[href^="tel:"]'
        );
        const phone = phoneEl?.textContent?.trim() || phoneEl?.getAttribute("href")?.replace("tel:", "");

        // Extract website
        const websiteEl = placeContainer.querySelector(
          'a[href*="http"]:not([href*="google.com"])'
        );
        const website = websiteEl?.getAttribute("href");

        // Extract categories
        const categoryEls = placeContainer.querySelectorAll(
          '[class*="category"], [data-testid="place-category"]'
        );
        const categories = Array.from(categoryEls)
          .map((el) => el.textContent?.trim())
          .filter(Boolean) as string[];

        // Extract hours
        const hoursContainer = placeContainer.querySelector(
          '[aria-label*="hours"], [data-testid="place-hours"]'
        );
        const hours = hoursContainer?.textContent?.trim();

        // Extract price level
        const priceEl = placeContainer.querySelector(
          '[class*="price"], [data-testid="place-price"]'
        );
        const priceLevel = priceEl?.textContent?.trim();

        // Extract place ID from URL or data attribute
        const placeIdFromUrl = placeId;

        // Extract images
        const imageEls = placeContainer.querySelectorAll(
          'img[src*="google.com"], [data-testid="place-image"]'
        );
        const images = Array.from(imageEls)
          .slice(0, 10)
          .map((el) => el.getAttribute("src"))
          .filter(Boolean) as string[];

        // Extract status (open/closed)
        const statusEl = placeContainer.querySelector(
          '[aria-label*="open"], [aria-label*="closed"], [data-testid="place-status"]'
        );
        const statusText = statusEl?.textContent?.toLowerCase() || "";
        const status = statusText.includes("open")
          ? "open"
          : statusText.includes("closed")
          ? "closed"
          : undefined;

        return {
          placeId: placeIdFromUrl,
          name: name || "Unknown",
          address: address || "",
          phone: phone || undefined,
          website: website || undefined,
          rating,
          reviewCount,
          categories: categories.length > 0 ? categories : undefined,
          hours: hours || undefined,
          priceLevel: priceLevel || undefined,
          status,
          images: images.length > 0 ? images : undefined,
          source: "google-maps",
          scrapedAt: new Date().toISOString(),
        };
      });

      return placeData;
    } finally {
      await page.close();
    }
  } catch (error) {
    console.error("Error fetching place details:", error);
    throw error;
  } finally {
    await scraper.close();
  }
}

/**
 * GET handler for place details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: placeId } = await params;

    // Validate place ID
    if (!placeId || placeId.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required parameter: id",
        },
        { status: 400 }
      );
    }

    // Fetch place details
    const placeDetails = await fetchPlaceDetails(placeId);

    return NextResponse.json(
      {
        success: true,
        data: placeDetails,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Place details error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
