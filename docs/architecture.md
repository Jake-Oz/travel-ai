# Travel-AI Architecture

## Overview

Travel-AI separates the conversational UI from domain-specific agents using a lightweight coordinator.

1. The UI sends natural language requests to `/api/search`.
2. `runTravelSearch` (src/lib/coordinator.ts) asks the OpenAI service to transform text into structured JSON.
3. The coordinator runs the flight and hotel agents in parallel and assembles itineraries.
4. Results and agent trace data return to the client and render inside the search experience.

## Modules

- `src/lib/services/openai.ts` handles prompt construction, error recovery, and schema validation of the LLM response.
- `src/lib/services/amadeus.ts` brokers OAuth, city-code lookup, and live flight/hotel searches against the Amadeus API with graceful fallbacks.
- `src/lib/agents/*.ts` orchestrate the provider calls, returning real Amadeus data when credentials are present and reverting to deterministic mock data otherwise.
- `src/lib/types/travel.ts` defines the canonical data shapes used across UI, API routes, and agents.
- `src/store/searchStore.ts` centralises client-side async state for search submissions and results.

## API Endpoints

- `POST /api/search` validates the request, executes the coordinator, and returns itinerary data plus an agent status trace.
- `POST /api/book` is currently stubbed but wired to a booking agent for confirmation IDs. Replace once Stripe checkout and provider bookings are integrated.

## Next Steps

- Add retries, caching, and circuit breaking around Amadeus calls; consider queuing for long-running workflows.
- Introduce a queue or workflow engine if agent execution expands beyond simple parallel calls.
- Add persistence for itineraries and payment intents to support post-payment booking reconciliation.
- Expand provider coverage (Duffel, Expedia, etc.) and introduce preference learning per traveller.
