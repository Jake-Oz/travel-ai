import OpenAI from "openai";

import type {
  NaturalLanguageSearchRequest,
  StructuredTravelQuery,
} from "@/lib/types/travel";
import { assertStructuredTravelQuery } from "@/lib/schema/travelSchema";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openaiApiKey = process.env.OPENAI_API_KEY;

const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

function buildPrompt(request: NaturalLanguageSearchRequest): string {
  const today = new Date().toISOString().slice(0, 10);
  const promptHeader =
    "You extract structured travel requirements from natural language requests and respond with JSON only.";
  const schemaReminder =
    "Return a single JSON object matching the schema below. Never add commentary.";
  const schemaDefinition = `Schema:
{
  "originCity": "string",
  "destinationCity": "string",
  "departureDate": "YYYY-MM-DD",
  "returnDate": "YYYY-MM-DD or null",
  "travelClass": "economy | premium_economy | business | first",
  "passengers": number,
  "nights": number or null,
  "hotelPreferences": {"stars": number or null, "location": "string or null"} or null,
  "budget": {"amount": number, "currency": "string"} or null,
  "notes": "string or null"
}`;
  const dateGuidance = `Today's date is ${today}. Use the user's stated dates exactly when provided by converting them to YYYY-MM-DD. If the user gives partial dates (like "Nov 7"), assume the next occurrence on or after today. Only fall back to default dates when the user gives no timing information at all.`;
  const preferenceLine = request.preferences
    ? `User preferences (optional): ${JSON.stringify(request.preferences)}`
    : "";

  return `${promptHeader}\n${schemaReminder}\n${schemaDefinition}\n${dateGuidance}\n\nUser request: ${request.query}\n${preferenceLine}`.trim();
}

function fallbackStructure(
  request: NaturalLanguageSearchRequest
): StructuredTravelQuery {
  const today = new Date();
  const defaultDeparture = new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000);
  const departureDate = defaultDeparture.toISOString().slice(0, 10);
  const defaultReturn = new Date(
    defaultDeparture.getTime() + 5 * 24 * 60 * 60 * 1000
  );

  return {
    originCity: "Sydney",
    destinationCity: "Tokyo",
    departureDate,
    returnDate: defaultReturn.toISOString().slice(0, 10),
    travelClass: request.preferences?.travelClass || "business",
    passengers: request.preferences?.passengers || 1,
    nights: request.preferences?.nights || 5,
    hotelPreferences: {
      stars: request.preferences?.hotelStars || 4,
      location: request.preferences?.hotelLocation || "Central",
    },
    budget:
      request.preferences?.budget ||
      (request.preferences?.travelClass === "first"
        ? { amount: 7500, currency: "USD" }
        : { amount: 5200, currency: "USD" }),
    notes: request.query,
  };
}

function stripJsonEnvelope(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```[a-zA-Z]*\n?/, "")
      .replace(/```$/, "")
      .trim();
  }
  return trimmed;
}

export async function structureQueryWithOpenAI(
  request: NaturalLanguageSearchRequest
): Promise<StructuredTravelQuery> {
  if (!openaiClient) {
    return fallbackStructure(request);
  }

  try {
    const result = await openaiClient.responses.create({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content:
            "You are Travel-AI's planning assistant. Respond with JSON only, never include explanations.",
        },
        {
          role: "user",
          content: buildPrompt(request),
        },
      ],
    });

    const outputText = stripJsonEnvelope(result.output_text);
    const parsed = JSON.parse(outputText);
    return assertStructuredTravelQuery(parsed);
  } catch (error) {
    console.error("OpenAI parsing failed", error);
    return fallbackStructure(request);
  }
}
