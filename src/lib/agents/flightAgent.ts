import type { FlightOffer, StructuredTravelQuery } from "@/lib/types/travel";
import {
  isAmadeusConfigured,
  searchAmadeusFlights,
} from "@/lib/services/amadeus";

const MOCK_DELAY_MS = 400;

function minutesBetween(start: string, end: string): number {
  return Math.max(
    0,
    (new Date(end).getTime() - new Date(start).getTime()) / 60000
  );
}

function buildIso(date: string, hour: number): string {
  const iso = new Date(`${date}T00:00:00Z`);
  iso.setUTCHours(hour, 0, 0, 0);
  return iso.toISOString();
}

function buildMockFlights(query: StructuredTravelQuery): FlightOffer[] {
  const outboundDeparture = buildIso(query.departureDate, 10);
  const outboundArrival = buildIso(query.departureDate, 20);
  const returnDeparture = query.returnDate
    ? buildIso(query.returnDate, 12)
    : null;
  const returnArrival = returnDeparture
    ? buildIso(query.returnDate as string, 22)
    : null;
  const currency = (query.budget?.currency || "AUD").toUpperCase();

  const offers: FlightOffer[] = [
    {
      id: "flight-1",
      airline: "AeroZen",
      flightNumber: "AZ123",
      class: query.travelClass,
      legs: [
        {
          departureAirport: `${query.originCity} International`,
          arrivalAirport: `${query.destinationCity} Gateway`,
          departureTime: outboundDeparture,
          arrivalTime: outboundArrival,
        },
        ...(returnDeparture && returnArrival
          ? [
              {
                departureAirport: `${query.destinationCity} Gateway`,
                arrivalAirport: `${query.originCity} International`,
                departureTime: returnDeparture,
                arrivalTime: returnArrival,
              },
            ]
          : []),
      ],
      durationMinutes: minutesBetween(outboundDeparture, outboundArrival),
      stops: 0,
      baggageAllowance: "2 x 32kg checked",
      price: {
        amount: query.budget?.amount
          ? Math.min(query.budget.amount * 0.6, 4200)
          : 3990,
        currency,
      },
      emissionsKg: 860,
      bookingUrl: "https://example.com/flight/az123",
    },
    {
      id: "flight-2",
      airline: "SkyPulse",
      flightNumber: "SP456",
      class: query.travelClass,
      legs: [
        {
          departureAirport: `${query.originCity} Intl`,
          arrivalAirport: `${query.destinationCity} Hub`,
          departureTime: buildIso(query.departureDate, 13),
          arrivalTime: buildIso(query.departureDate, 23),
        },
      ],
      durationMinutes: 600,
      stops: 1,
      baggageAllowance: "1 x 23kg checked",
      price: {
        amount: query.budget?.amount
          ? Math.min(query.budget.amount * 0.5, 3300)
          : 2890,
        currency,
      },
      emissionsKg: 720,
      bookingUrl: "https://example.com/flight/sp456",
    },
  ];

  return offers;
}

export async function flightAgentSearch(
  query: StructuredTravelQuery
): Promise<FlightOffer[]> {
  if (isAmadeusConfigured()) {
    try {
      const amadeusResults = await searchAmadeusFlights(query);
      if (amadeusResults.length) {
        return amadeusResults;
      }
    } catch (error) {
      console.error("Flight agent (Amadeus) failed", error);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
  return buildMockFlights(query);
}
