export type TravelClass =
  | "economy"
  | "premium_economy"
  | "business"
  | "first";

export interface SearchPreferences {
  travelClass?: TravelClass;
  passengers?: number;
  nights?: number;
  hotelLocation?: string;
  hotelStars?: number;
  budget?: {
    amount: number;
    currency: string;
  };
}

export interface NaturalLanguageSearchRequest {
  query: string;
  preferences?: SearchPreferences;
}

export interface StructuredTravelQuery {
  originCity: string;
  destinationCity: string;
  departureDate: string;
  returnDate?: string | null;
  travelClass: TravelClass;
  passengers: number;
  nights?: number | null;
  hotelPreferences?: {
    stars?: number;
    location?: string;
  } | null;
  budget?: {
    amount: number;
    currency: string;
  } | null;
  notes?: string | null;
}

export interface FlightLeg {
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  arrivalTime: string;
}

export interface FlightOffer {
  id: string;
  airline: string;
  flightNumber: string;
  legs: FlightLeg[];
  class: TravelClass;
  durationMinutes: number;
  stops: number;
  baggageAllowance?: string;
  price: {
    amount: number;
    currency: string;
  };
  emissionsKg?: number;
  bookingUrl?: string;
}

export interface LodgingOffer {
  id: string;
  name: string;
  brand?: string;
  stars?: number;
  location: string;
  addressLine?: string;
  checkIn?: string;
  checkOut?: string;
  nightlyRate: {
    amount: number;
    currency: string;
  };
  totalPrice: {
    amount: number;
    currency: string;
  };
  amenities?: string[];
  imageUrl?: string;
  bookingUrl?: string;
}

export interface ItineraryPackage {
  id: string;
  headline: string;
  summary: string;
  flight: FlightOffer;
  lodging: LodgingOffer;
  totalPrice: {
    amount: number;
    currency: string;
  };
  coordinatorScore?: number;
  tags?: string[];
}

export type AgentName =
  | "Coordinator"
  | "LLM Parser"
  | "Flight Agent"
  | "Hotel Agent"
  | "Booking Agent";

export type AgentStatus = "pending" | "running" | "completed" | "failed";

export interface AgentTrace {
  agent: AgentName;
  status: AgentStatus;
  elapsedMs?: number;
  message?: string;
}

export interface SearchApiResponse {
  itineraries: ItineraryPackage[];
  trace: AgentTrace[];
}

export interface BookingRequest {
  itineraryId: string;
  paymentIntentId: string;
  contactEmail: string;
}

export interface BookingResponse {
  confirmationNumber: string;
  status: "confirmed" | "pending";
}
