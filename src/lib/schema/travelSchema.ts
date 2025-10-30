import { z } from "zod";

import type { StructuredTravelQuery, TravelClass } from "@/lib/types/travel";

const travelClassValues: TravelClass[] = [
  "economy",
  "premium_economy",
  "business",
  "first",
];

export const structuredTravelQuerySchema = z.object({
  originCity: z.string().min(2, "Origin city is required"),
  destinationCity: z.string().min(2, "Destination city is required"),
  departureDate: z
    .string()
    .regex(/\d{4}-\d{2}-\d{2}/, "Expected YYYY-MM-DD"),
  returnDate: z
    .string()
    .regex(/\d{4}-\d{2}-\d{2}/, "Expected YYYY-MM-DD")
    .optional()
    .nullable(),
  travelClass: z.enum(travelClassValues),
  passengers: z.number().int().positive(),
  nights: z.number().int().positive().optional().nullable(),
  hotelPreferences: z
    .object({
      stars: z.number().min(1).max(5).optional(),
      location: z.string().min(1).optional(),
    })
    .optional()
    .nullable(),
  budget: z
    .object({
      amount: z.number().positive(),
      currency: z.string().length(3),
    })
    .optional()
    .nullable(),
  notes: z.string().optional().nullable(),
});

export type StructuredTravelQueryShape = z.infer<
  typeof structuredTravelQuerySchema
>;

export function assertStructuredTravelQuery(
  payload: unknown,
): StructuredTravelQuery {
  return structuredTravelQuerySchema.parse(payload);
}
