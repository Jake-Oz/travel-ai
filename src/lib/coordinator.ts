import { performance } from "node:perf_hooks";

import type {
  AgentTrace,
  FlightOffer,
  ItineraryPackage,
  LodgingOffer,
  NaturalLanguageSearchRequest,
  SearchApiResponse,
  StructuredTravelQuery,
} from "@/lib/types/travel";
import { structureQueryWithOpenAI } from "@/lib/services/openai";
import { flightAgentSearch } from "@/lib/agents/flightAgent";
import { hotelAgentSearch } from "@/lib/agents/hotelAgent";

const DEFAULT_DISPLAY_CURRENCY = (
  process.env.PAYMENTS_DEFAULT_CURRENCY ?? "AUD"
).toUpperCase();

function normalizeCurrency(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.toUpperCase();
}

function updateTrace(
  trace: AgentTrace[],
  agent: AgentTrace["agent"],
  status: AgentTrace["status"],
  elapsedMs?: number,
  message?: string
) {
  const index = trace.findIndex((entry) => entry.agent === agent);
  if (index >= 0) {
    trace[index] = { agent, status, elapsedMs, message };
  } else {
    trace.push({ agent, status, elapsedMs, message });
  }
}

function buildItineraries(
  flights: FlightOffer[],
  hotels: LodgingOffer[],
  query: StructuredTravelQuery
): ItineraryPackage[] {
  const combinations: ItineraryPackage[] = [];
  let counter = 1;

  for (const flight of flights) {
    for (const lodging of hotels) {
      if (
        typeof flight.price?.amount !== "number" ||
        Number.isNaN(flight.price.amount) ||
        typeof lodging.totalPrice?.amount !== "number" ||
        Number.isNaN(lodging.totalPrice.amount)
      ) {
        console.warn("Skipping itinerary due to invalid pricing", {
          flightId: flight.id,
          lodgingId: lodging.id,
          flightAmount: flight.price?.amount,
          lodgingAmount: lodging.totalPrice?.amount,
        });
        continue;
      }

      const requestedCurrency = normalizeCurrency(query.budget?.currency);
      const flightCurrency = normalizeCurrency(flight.price.currency);
      const lodgingCurrency = normalizeCurrency(lodging.totalPrice.currency);
      const displayCurrency =
        requestedCurrency ??
        flightCurrency ??
        lodgingCurrency ??
        DEFAULT_DISPLAY_CURRENCY;

      const currencyConsistent =
        (!flightCurrency || flightCurrency === displayCurrency) &&
        (!lodgingCurrency || lodgingCurrency === displayCurrency);

      if (
        !currencyConsistent &&
        flightCurrency &&
        lodgingCurrency &&
        flightCurrency !== lodgingCurrency
      ) {
        console.warn("Itinerary currency mismatch detected", {
          flightId: flight.id,
          lodgingId: lodging.id,
          flightCurrency,
          lodgingCurrency,
          displayCurrency,
        });
      }

      const totalAmount = Number.parseFloat(
        (flight.price.amount + lodging.totalPrice.amount).toFixed(2)
      );
      const currency = displayCurrency;

      combinations.push({
        id: `itinerary-${counter}`,
        headline: `${query.destinationCity} escape`,
        summary: `${flight.airline} ${flight.flightNumber} paired with ${lodging.name}.`,
        flight,
        lodging,
        totalPrice: { amount: totalAmount, currency },
        priceBreakdown: {
          flight: {
            amount: Number.parseFloat(flight.price.amount.toFixed(2)),
            currency: flightCurrency ?? displayCurrency,
          },
          lodging: {
            amount: Number.parseFloat(
              lodging.totalPrice.amount.toFixed(2)
            ),
            currency: lodgingCurrency ?? displayCurrency,
          },
          currencyConsistent,
        },
        coordinatorScore: Math.round(Math.random() * 100) / 100,
        tags: [
          flight.stops === 0 ? "Nonstop" : "Layover",
          `${query.travelClass.toUpperCase()}`,
          `${lodging.stars ?? 4}-star stay`,
          `${currency} ${totalAmount.toFixed(0)}`,
          ...(!currencyConsistent ? ["Mixed currency"] : []),
        ],
      });
      counter += 1;
      if (combinations.length >= 4) break;
    }
    if (combinations.length >= 4) break;
  }

  return combinations;
}

export async function runTravelSearch(
  request: NaturalLanguageSearchRequest
): Promise<SearchApiResponse> {
  const trace: AgentTrace[] = [
    { agent: "Coordinator", status: "running" },
    { agent: "LLM Parser", status: "pending" },
    { agent: "Flight Agent", status: "pending" },
    { agent: "Hotel Agent", status: "pending" },
  ];

  const llmStart = performance.now();
  updateTrace(trace, "LLM Parser", "running");
  const structured = await structureQueryWithOpenAI(request);
  updateTrace(
    trace,
    "LLM Parser",
    "completed",
    Math.round(performance.now() - llmStart)
  );

  let flights: FlightOffer[] = [];
  let hotels: LodgingOffer[] = [];

  const flightPromise = (async () => {
    updateTrace(trace, "Flight Agent", "running");
    const start = performance.now();
    try {
      flights = await flightAgentSearch(structured);
      updateTrace(
        trace,
        "Flight Agent",
        "completed",
        Math.round(performance.now() - start),
        `${flights.length} options ready`
      );
    } catch (error) {
      console.error("Flight agent failed", error);
      updateTrace(trace, "Flight Agent", "failed");
    }
  })();

  const hotelPromise = (async () => {
    updateTrace(trace, "Hotel Agent", "running");
    const start = performance.now();
    try {
      hotels = await hotelAgentSearch(structured);
      updateTrace(
        trace,
        "Hotel Agent",
        "completed",
        Math.round(performance.now() - start),
        `${hotels.length} stays ready`
      );
    } catch (error) {
      console.error("Hotel agent failed", error);
      updateTrace(trace, "Hotel Agent", "failed");
    }
  })();

  await Promise.all([flightPromise, hotelPromise]);
  updateTrace(trace, "Coordinator", "completed");

  const itineraries = buildItineraries(flights, hotels, structured);
  return { itineraries, trace };
}
