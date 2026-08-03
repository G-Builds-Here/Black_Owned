import { NextRequest, NextResponse } from 'next/server';
import { googleMapsScraper } from '@/services/google-maps-scraper';

/**
 * GET /api/scraper/google-maps/places/[id]
 * Returns detailed place information by place ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id || id.trim() === '') {
      return NextResponse.json(
        { error: 'Place ID is required' },
        { status: 400 }
      );
    }

    const placeDetails = await googleMapsScraper.getPlaceDetails(id.trim());

    if (!placeDetails) {
      return NextResponse.json(
        { error: 'Place not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      place: placeDetails
    });
  } catch (error) {
    console.error('Place details error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
