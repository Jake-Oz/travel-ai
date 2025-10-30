import type { LodgingOffer, StructuredTravelQuery } from "@/lib/types/travel";
import {
  isAmadeusConfigured,
  searchAmadeusHotels,
} from "@/lib/services/amadeus";

const MOCK_DELAY_MS = 320;

function calculateStayTotal(rate: number, nights?: number | null): number {
  const stayNights = nights && nights > 0 ? nights : 5;
  return rate * stayNights;
}

function buildMockHotels(query: StructuredTravelQuery): LodgingOffer[] {
  const currency = query.budget?.currency || "USD";
  const nights = query.nights || 5;
  const keepsake = query.destinationCity.includes("Tokyo")
    ? "Shinjuku"
    : query.destinationCity;

  const baseOffers: LodgingOffer[] = [
    {
      id: "hotel-1",
      name: `${keepsake} Garden Suites`,
      brand: "Luna Hotels",
      stars: query.hotelPreferences?.stars || 4,
      location: `${keepsake} district`,
      checkIn: query.departureDate,
      checkOut: query.returnDate || undefined,
      nightlyRate: { amount: 420, currency },
      totalPrice: { amount: calculateStayTotal(420, nights), currency },
      amenities: ["Executive lounge", "24h concierge", "Spa"],
      imageUrl: "https://placehold.co/600x400",
      bookingUrl: "https://example.com/hotel/luna",
    },
    {
      id: "hotel-2",
      name: `${keepsake} Skyline Hotel`,
      brand: "Aurora Collection",
      stars: (query.hotelPreferences?.stars || 4) + 0.5,
      location: `${keepsake} skyline`,
      checkIn: query.departureDate,
      checkOut: query.returnDate || undefined,
      nightlyRate: { amount: 310, currency },
      totalPrice: { amount: calculateStayTotal(310, nights), currency },
      amenities: ["Rooftop bar", "Smart room controls", "Fitness studio"],
      imageUrl: "https://placehold.co/600x400",
      bookingUrl: "https://example.com/hotel/aurora",
    },
  ];

  return baseOffers;
}

export async function hotelAgentSearch(
  query: StructuredTravelQuery
): Promise<LodgingOffer[]> {
  if (isAmadeusConfigured()) {
    try {
      const amadeusHotels = await searchAmadeusHotels(query);
      if (amadeusHotels.length) {
        return amadeusHotels;
      }
    } catch (error) {
      console.error("Hotel agent (Amadeus) failed", error);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
  return buildMockHotels(query);
}
