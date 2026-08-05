import { NextRequest } from 'next/server';
import { GET } from './route';

// Mock the scraper
jest.mock('@/services/google-maps-scraper', () => ({
  googleMapsScraper: {
    getPlaceDetails: jest.fn(),
  },
}));

const { googleMapsScraper } = require('@/services/google-maps-scraper');

describe('GET /api/scraper/google-maps/places/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when place ID is missing', async () => {
    const request = new NextRequest('http://localhost/api/scraper/google-maps/places/');

    const response = await GET(request, { params: { id: '' } });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ error: 'Place ID is required' });
  });

  it('returns 400 when place ID is whitespace only', async () => {
    const request = new NextRequest('http://localhost/api/scraper/google-maps/places/ ');

    const response = await GET(request, { params: { id: '   ' } });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ error: 'Place ID is required' });
  });

  it('returns 404 when place is not found', async () => {
    (googleMapsScraper.getPlaceDetails as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/scraper/google-maps/places/ChIJN1t_tDeuEmsRUsoyG83frY4');

    const response = await GET(request, { params: { id: 'ChIJN1t_tDeuEmsRUsoyG83frY4' } });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json).toEqual({ error: 'Place not found' });
  });

  it('returns place details when found', async () => {
    const mockPlaceDetails = {
      placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      name: 'Test Business',
      formattedAddress: '123 Test Street, Sydney NSW 2000, Australia',
      formattedPhoneNumber: '+61 2 1234 5678',
      website: 'https://testbusiness.com',
      rating: 4.5,
      reviewCount: 128,
      reviews: [
        {
          authorName: 'John Doe',
          rating: 5,
          text: 'Great place!',
          time: '2 weeks ago',
        },
        {
          authorName: 'Jane Smith',
          rating: 4,
          text: 'Good service',
          time: '1 month ago',
        },
      ],
      businessStatus: 'OPERATIONAL',
      openingHours: {
        openNow: true,
        weekdayText: [
          'Monday: 9:00 AM - 5:00 PM',
          'Tuesday: 9:00 AM - 5:00 PM',
          'Wednesday: 9:00 AM - 5:00 PM',
          'Thursday: 9:00 AM - 5:00 PM',
          'Friday: 9:00 AM - 5:00 PM',
          'Saturday: Closed',
          'Sunday: Closed',
        ],
      },
      source: 'google-maps',
    };

    (googleMapsScraper.getPlaceDetails as jest.Mock).mockResolvedValue(mockPlaceDetails);

    const request = new NextRequest('http://localhost/api/scraper/google-maps/places/ChIJN1t_tDeuEmsRUsoyG83frY4');

    const response = await GET(request, { params: { id: 'ChIJN1t_tDeuEmsRUsoyG83frY4' } });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ place: mockPlaceDetails });
  });

  it('returns place details with minimal fields when optional fields are missing', async () => {
    const mockPlaceDetails = {
      placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      name: 'Test Business',
      formattedAddress: '123 Test Street',
      source: 'google-maps',
    };

    (googleMapsScraper.getPlaceDetails as jest.Mock).mockResolvedValue(mockPlaceDetails);

    const request = new NextRequest('http://localhost/api/scraper/google-maps/places/ChIJN1t_tDeuEmsRUsoyG83frY4');

    const response = await GET(request, { params: { id: 'ChIJN1t_tDeuEmsRUsoyG83frY4' } });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ place: mockPlaceDetails });
  });

  it('trims whitespace from place ID', async () => {
    const mockPlaceDetails = {
      placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      name: 'Test Business',
      formattedAddress: '123 Test Street',
      source: 'google-maps',
    };

    (googleMapsScraper.getPlaceDetails as jest.Mock).mockResolvedValue(mockPlaceDetails);

    const request = new NextRequest('http://localhost/api/scraper/google-maps/places/ChIJN1t_tDeuEmsRUsoyG83frY4 ');

    const response = await GET(request, { params: { id: ' ChIJN1t_tDeuEmsRUsoyG83frY4 ' } });

    expect(response.status).toBe(200);
    expect(googleMapsScraper.getPlaceDetails).toHaveBeenCalledWith('ChIJN1t_tDeuEmsRUsoyG83frY4');
  });

  it('returns 500 on internal error', async () => {
    (googleMapsScraper.getPlaceDetails as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

    const request = new NextRequest('http://localhost/api/scraper/google-maps/places/ChIJN1t_tDeuEmsRUsoyG83frY4');

    const response = await GET(request, { params: { id: 'ChIJN1t_tDeuEmsRUsoyG83frY4' } });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json).toEqual({ error: 'Internal server error' });
  });
});
