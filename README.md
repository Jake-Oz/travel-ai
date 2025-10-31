## Travel-AI

Travel-AI is a conversation-driven travel planning experience. Users describe their ideal trip in natural language and the platform orchestrates specialized agents to produce bookable flight and accommodation packages that can be finalized with Apple Pay through Stripe.

### Stack

- Next.js 15 App Router with TypeScript and React Server Components.
- Tailwind CSS v4 for theming and responsive layout.
- Zustand state store for client orchestration.
- OpenAI ChatGPT API for natural language understanding (via `openai`).
- Amadeus sandbox integration for live flight and hotel availability (with graceful fallback data when credentials are absent).
- Stripe Elements as the Apple Pay integration surface.
- Prisma ORM with PostgreSQL for booking persistence.
- Optional Resend integration for post-booking confirmation emails.

### Getting Started

1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env.local` (or create `.env.local`) and fill in API keys plus database connection details.
3. Run database migrations: `npm run prisma:migrate` (requires a reachable Postgres instance defined in `DATABASE_URL`).
4. Generate the Prisma client (optional if `migrate` already ran): `npm run prisma:generate`.
5. Start the dev server: `npm run dev` (http://localhost:3000).

### Environment Variables

| Name                                 | Required | Description                                                                                                 |
| ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                     | Optional | Enables live structuring of natural language requests. Without it, the search coordinator uses mocked data. |
| `OPENAI_MODEL`                       | Optional | Defaults to `gpt-4o-mini`.                                                                                  |
| `AMADEUS_CLIENT_ID`                  | Optional | Required to fetch real flight and hotel data from the Amadeus test environment.                             |
| `AMADEUS_CLIENT_SECRET`              | Optional | Companion secret for the Amadeus client.                                                                    |
| `AMADEUS_BASE_URL`                   | Optional | Defaults to the Amadeus test API; override for production.                                                  |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Optional | Loads Stripe Elements for Apple Pay on the client.                                                          |
| `NEXT_PUBLIC_STRIPE_MODE`            | Optional | Defaults to `test`; controls the on-screen messaging for Stripe’s Apple Pay guidance.                       |
| `STRIPE_SECRET_KEY`                  | Optional | Enables server-side payment intent creation.                                                                |
| `PAYMENTS_DEFAULT_COUNTRY`           | Optional | Fallback ISO country for Apple Pay merchant sessions (defaults to `AU`).                                    |
| `PAYMENTS_DEFAULT_CURRENCY`          | Optional | Fallback currency code used when itineraries omit pricing (defaults to `AUD`).                              |
| `RESEND_API_KEY`                     | Optional | Sends confirmation emails after successful bookings when set.                                               |
| `RESEND_FROM_EMAIL`                  | Optional | Custom “from” address for confirmation emails (defaults to `notifications@travel-ai.dev`).                  |
| `DATABASE_URL`                       | Required | Postgres connection string used by Prisma to persist bookings and travellers.                               |

### Project Structure Highlights

- `src/components/search` – Search form and booking surface.
- `src/components/status` – Agent timeline visualisation.
- `src/components/itinerary` – Result cards and listings.
- `src/lib/coordinator.ts` – Orchestrates ChatGPT parsing and agent execution.
- `src/lib/agents` – Flight/hotel/booking agents; flight and lodging agents now leverage Amadeus when credentials are provided.
- `src/lib/services/amadeus.ts` – Handles OAuth, city resolution, and Amadeus API access for flights and hotels.
- `src/app/api/search` – Coordinator API endpoint.
- `src/app/api/book` – Booking endpoint that triggers Amadeus, persists to Postgres, and dispatches confirmation email.
- `src/lib/services/bookingPersistence.ts` – Maps booking payloads into Prisma writes.
- `src/lib/services/prisma.ts` – Singleton Prisma client used across server modules.

### Roadmap

- Expand travel integrations beyond Amadeus (Duffel, Expedia, etc.).
- Persist itineraries and introduce user profiles for preference learning.
- Connect Stripe Payment Intents with Apple Pay domain verification.
- Add automated testing for agent normalization logic.

### Apple Pay testing

Stripe’s [Apple Pay web documentation](https://docs.stripe.com/apple-pay?platform=web) allows you to stay in test mode while authorising with a real Apple Pay card. With the test API keys loaded, any Apple Pay authorisation returns a Stripe test token—no charge is captured. Recommended flow:

1. Register your local dev domain (`localhost`, or the tunnel hostname) in Stripe’s Payment Method Domains settings.
2. Keep `NEXT_PUBLIC_STRIPE_MODE=test` and use your real Apple Wallet card in Safari; the UI will remind you the payment is test-only.
3. Inspect the Payment Intent in the Stripe dashboard (test mode) to verify it reaches `succeeded`; Stripe flags these as test transactions even though a real card authorised them.
4. Set `RESEND_API_KEY` if you’d like travellers to receive the booking confirmation email at the Apple Pay contact address.
5. For end-to-end live verification, swap in live keys and make a small payment, then refund through the dashboard.
