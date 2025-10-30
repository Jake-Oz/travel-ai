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

function updateTrace(
  trace: AgentTrace[],
  agent: AgentTrace["agent"],
  status: AgentTrace["status"],
  elapsedMs?: number,
  message?: string,
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
  query: StructuredTravelQuery,
): ItineraryPackage[] {
  const combinations: ItineraryPackage[] = [];
  let counter = 1;

  for (const flight of flights) {
    for (const lodging of hotels) {
      const totalAmount = flight.price.amount + lodging.totalPrice.amount;
      const currency = flight.price.currency;
      combinations.push({
        id: `itinerary-${counter}`,
        headline: `${query.destinationCity} escape`,
        summary: `${flight.airline} ${flight.flightNumber} paired with ${lodging.name}.`,
        flight,
        lodging,
        totalPrice: { amount: totalAmount, currency },
        coordinatorScore: Math.round(Math.random() * 100) / 100,
        tags: [
          flight.stops === 0 ? "Nonstop" : "Layover",
          `${query.travelClass.toUpperCase()}`,
          `${lodging.stars ?? 4}-star stay`,
          `${currency} ${totalAmount.toFixed(0)}`,
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
  request: NaturalLanguageSearchRequest,
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
    Math.round(performance.now() - llmStart),
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
        `${flights.length} options ready`,
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
        `${hotels.length} stays ready`,
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
