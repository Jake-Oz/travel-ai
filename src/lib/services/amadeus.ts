import type {
  BookingTraveler,
  FlightLeg,
  FlightOffer,
  LodgingOffer,
  StructuredTravelQuery,
  TravelClass,
} from "@/lib/types/travel";

const AMADEUS_BASE_URL =
  process.env.AMADEUS_BASE_URL || "https://test.api.amadeus.com";
const AMADEUS_CLIENT_ID = process.env.AMADEUS_CLIENT_ID;
const AMADEUS_CLIENT_SECRET = process.env.AMADEUS_CLIENT_SECRET;

interface AmadeusAccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  state?: string;
  scope?: string;
}

interface AmadeusFlightOffersResponse {
  data?: Array<{
    id: string;
    source?: string;
    lastTicketingDate?: string;
    itineraries: Array<{
      duration: string;
      segments: Array<{
        departure: { at: string; iataCode: string };
        arrival: { at: string; iataCode: string };
        carrierCode: string;
        marketingCarrierCode?: string;
        number?: string;
        duration?: string;
      }>;
    }>;
    price: { currency: string; total: string };
    travelerPricings?: Array<{
      fareDetailsBySegment?: Array<{
        cabin?: string;
        includedCheckedBags?: {
          weight?: number;
          weightUnit?: string;
          quantity?: number;
        };
      }>;
    }>;
  }>;
  dictionaries?: {
    carriers?: Record<string, string>;
  };
}

interface AmadeusCitySearchResponse {
  data?: Array<{
    iataCode: string;
    name: string;
    address?: { countryCode?: string };
    type?: string;
    subType?: string;
  }>;
}

interface AmadeusHotelsByCityResponse {
  data?: Array<{
    hotelId: string;
  }>;
}

interface AmadeusHotelOffersResponse {
  data?: Array<{
    hotel: {
      name: string;
      rating?: string;
      address?: { cityName?: string; lines?: string[] };
      geoCode?: { latitude?: number; longitude?: number };
      contact?: { phone?: string; email?: string; fax?: string; uri?: string };
      self?: string;
    };
    available?: boolean;
    type?: string;
    self?: string;
    offers: Array<{
      id: string;
      checkInDate?: string;
      checkOutDate?: string;
      price: {
        currency: string;
        total: string;
        taxes?: Array<{ amount: string }>;
      };
      room?: { type?: string; typeEstimated?: { category?: string } };
      boardType?: string;
      self?: string;
    }>;
  }>;
}

interface AmadeusFlightPricingResponse {
  data?: {
    type?: string;
    flightOffers?: Array<
      Record<string, unknown> & {
        price?: { total?: string; currency?: string };
      }
    >;
  };
}

interface AmadeusFlightOrderResponse {
  data?: {
    id?: string;
    type?: string;
    flightOffers?: Array<Record<string, unknown>>;
    travelers?: Array<Record<string, unknown>>;
    associatedRecords?: Array<{ reference?: string; creationDate?: string }>;
  };
  meta?: Record<string, unknown>;
}

interface AmadeusHotelBookingResponse {
  data?: {
    id?: string;
    providerConfirmationId?: string;
    guests?: Array<Record<string, unknown>>;
    payments?: Array<Record<string, unknown>>;
    creationDate?: string;
  };
  meta?: Record<string, unknown>;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache: CachedToken = {
  token: "",
  expiresAt: 0,
};

const cityCodeCache = new Map<string, string>();

const STATIC_CITY_CODES: Record<string, string> = {
  tokyo: "TYO",
  sydney: "SYD",
  "new york": "NYC",
  london: "LON",
  paris: "PAR",
  singapore: "SIN",
  dubai: "DXB",
  "san francisco": "SFO",
  "los angeles": "LAX",
  "hong kong": "HKG",
  seoul: "SEL",
  bangkok: "BKK",
};

const AMADEUS_TEST_HOTEL_CITIES = new Set([
  "PAR",
  "NYC",
  "MAD",
  "LON",
  "SYD",
  "BER",
]);

const STATIC_AMADEUS_HOTEL_IDS: Record<string, string[]> = {
  PAR: ["HLPAR266", "ACPARH29", "TEPARCFG"],
  NYC: ["ADNYCCTB", "ADNYCRES", "ADNYCFJJ"],
  LON: ["TELONMFS", "TELONMFM"],
  MAD: ["ADMDPMAD", "ADMDPASL"],
};

function formatDateOnly(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

function ensureFutureDate(
  dateStr: string | null | undefined,
  fallbackOffsetDays: number
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!dateStr || Number.isNaN(Date.parse(dateStr))) {
    return formatDateOnly(addDays(today, fallbackOffsetDays));
  }

  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime()) || parsed < today) {
    return formatDateOnly(addDays(today, fallbackOffsetDays));
  }

  return formatDateOnly(parsed);
}

export function isAmadeusConfigured(): boolean {
  return Boolean(AMADEUS_CLIENT_ID && AMADEUS_CLIENT_SECRET);
}

function minutesFromIsoDuration(duration: string | undefined): number {
  if (!duration) return 0;
  const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!matches) return 0;
  const hours = matches[1] ? Number.parseInt(matches[1], 10) : 0;
  const minutes = matches[2] ? Number.parseInt(matches[2], 10) : 0;
  return hours * 60 + minutes;
}

function baggageAllowanceText(details?: {
  weight?: number;
  weightUnit?: string;
  quantity?: number;
}): string | undefined {
  if (!details) return undefined;
  if (details.quantity) {
    return `${details.quantity} checked bag${details.quantity > 1 ? "s" : ""}`;
  }
  if (details.weight && details.weightUnit) {
    return `${details.weight}${details.weightUnit} checked bag`;
  }
  return undefined;
}

async function getAccessToken(): Promise<string> {
  if (!isAmadeusConfigured()) {
    throw new Error("Amadeus credentials are not configured");
  }

  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: AMADEUS_CLIENT_ID as string,
    client_secret: AMADEUS_CLIENT_SECRET as string,
  });

  const response = await fetch(`${AMADEUS_BASE_URL}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload =
    (await response.json()) as Partial<AmadeusAccessTokenResponse> & {
      error?: string;
      error_description?: string;
    };

  if (!response.ok || !payload.access_token) {
    const reason =
      payload.error_description || payload.error || `status ${response.status}`;
    throw new Error(`Failed to authenticate with Amadeus (${reason})`);
  }

  const data = payload as AmadeusAccessTokenResponse;
  tokenCache.token = data.access_token;
  tokenCache.expiresAt = now + (data.expires_in - 60) * 1000;
  return tokenCache.token;
}

type AmadeusQueryParam = string | number | boolean | undefined | null;

async function amadeusGet<T>(
  path: string,
  params: Record<string, AmadeusQueryParam>
): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(`${AMADEUS_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(
        key,
        typeof value === "boolean" ? String(value) : String(value)
      );
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Amadeus request failed (${response.status}): ${errorText}`
    );
  }

  return (await response.json()) as T;
}

async function amadeusPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${AMADEUS_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Amadeus request failed (${response.status}): ${errorText}`
    );
  }

  return (await response.json()) as T;
}

async function resolveCityCode(cityName: string): Promise<string> {
  const normalized = cityName.trim().toLowerCase();
  if (cityCodeCache.has(normalized)) {
    return cityCodeCache.get(normalized) as string;
  }

  if (STATIC_CITY_CODES[normalized]) {
    const fallback = STATIC_CITY_CODES[normalized];
    cityCodeCache.set(normalized, fallback);
    return fallback;
  }

  const response = await amadeusGet<AmadeusCitySearchResponse>(
    "/v1/reference-data/locations",
    {
      keyword: cityName.trim().toUpperCase().slice(0, 10),
      subType: "CITY,AIRPORT",
      "page[limit]": 5,
      view: "LIGHT",
    }
  );

  const match = response.data?.find(
    (entry) => entry.subType === "CITY" && entry.iataCode
  );
  if (match?.iataCode) {
    cityCodeCache.set(normalized, match.iataCode);
    return match.iataCode;
  }

  if (response.data?.length) {
    const first = response.data.find((entry) => entry.iataCode);
    if (first?.iataCode) {
      cityCodeCache.set(normalized, first.iataCode);
      return first.iataCode;
    }
  }

  const threeLetter = cityName.slice(0, 3).toUpperCase();
  cityCodeCache.set(normalized, threeLetter);
  return threeLetter;
}

function mapTravelClass(travelClass: TravelClass): string {
  switch (travelClass) {
    case "premium_economy":
      return "PREMIUM_ECONOMY";
    case "business":
      return "BUSINESS";
    case "first":
      return "FIRST";
    default:
      return "ECONOMY";
  }
}

function buildFlightOffer(
  offer: NonNullable<AmadeusFlightOffersResponse["data"]>[number],
  dictionaries: AmadeusFlightOffersResponse["dictionaries"],
  query: StructuredTravelQuery
): FlightOffer {
  const firstSegment = offer.itineraries[0]?.segments[0];
  const legs: FlightLeg[] = offer.itineraries.flatMap((itinerary) =>
    itinerary.segments.map((segment) => ({
      departureAirport: segment.departure.iataCode,
      arrivalAirport: segment.arrival.iataCode,
      departureTime: segment.departure.at,
      arrivalTime: segment.arrival.at,
    }))
  );

  const airlineCode =
    firstSegment?.marketingCarrierCode ||
    firstSegment?.carrierCode ||
    "Unknown";
  const airlineName = dictionaries?.carriers?.[airlineCode] || airlineCode;

  const baggage =
    offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.includedCheckedBags;

  const itineraryDuration = offer.itineraries
    .map((itinerary) => minutesFromIsoDuration(itinerary.duration))
    .reduce((total, minutes) => total + minutes, 0);

  return {
    id: offer.id,
    airline: airlineName,
    flightNumber: `${airlineCode}${firstSegment?.number || ""}`.trim(),
    legs,
    class: query.travelClass,
    durationMinutes: itineraryDuration,
    stops: Math.max(legs.length - 1, 0),
    baggageAllowance: baggageAllowanceText(baggage),
    price: {
      amount: Number.parseFloat(offer.price.total),
      currency: offer.price.currency,
    },
    bookingUrl: undefined,
    amadeus: {
      raw: offer,
    },
  };
}

export async function searchAmadeusFlights(
  query: StructuredTravelQuery,
  maxResults = 4
): Promise<FlightOffer[]> {
  const originCode = await resolveCityCode(query.originCity);
  const destinationCode = await resolveCityCode(query.destinationCity);
  const safeDeparture = ensureFutureDate(query.departureDate, 30);

  let safeReturn: string | undefined;
  if (query.returnDate) {
    safeReturn = ensureFutureDate(query.returnDate, 37);
    if (safeReturn <= safeDeparture) {
      safeReturn = formatDateOnly(
        addDays(new Date(safeDeparture), Math.max(query.nights ?? 5, 1))
      );
    }
  }

  const response = await amadeusGet<AmadeusFlightOffersResponse>(
    "/v2/shopping/flight-offers",
    {
      originLocationCode: originCode,
      destinationLocationCode: destinationCode,
      departureDate: safeDeparture,
      adults: Math.min(query.passengers, 9),
      travelClass: mapTravelClass(query.travelClass),
      returnDate: safeReturn,
      currencyCode: query.budget?.currency,
      max: maxResults,
    }
  );

  const offers = response.data ?? [];
  if (!offers.length) {
    return [];
  }

  return offers
    .slice(0, maxResults)
    .map((offer) => buildFlightOffer(offer, response.dictionaries, query));
}

async function fetchHotelIds(cityCode: string): Promise<string[]> {
  const sanitized = cityCode.trim().slice(0, 3).toUpperCase();

  if (!AMADEUS_TEST_HOTEL_CITIES.has(sanitized)) {
    return STATIC_AMADEUS_HOTEL_IDS[sanitized] ?? [];
  }

  try {
    const response = await amadeusGet<AmadeusHotelsByCityResponse>(
      "/v1/reference-data/locations/hotels/by-city",
      {
        cityCode: sanitized,
        hotelSource: "ALL",
      }
    );

    const liveIds =
      response.data?.map((hotel) => hotel.hotelId).filter(Boolean) ?? [];
    if (liveIds.length) {
      return liveIds.slice(0, 10);
    }
  } catch (error) {
    console.warn("Amadeus hotel id lookup failed", {
      cityCode,
      sanitized,
      error,
    });
  }

  return STATIC_AMADEUS_HOTEL_IDS[sanitized] ?? [];
}

export async function searchAmadeusHotels(
  query: StructuredTravelQuery,
  maxResults = 4
): Promise<LodgingOffer[]> {
  const destinationCode = await resolveCityCode(query.destinationCity);
  const cityCode = destinationCode.slice(0, 3).toUpperCase();

  const checkIn = ensureFutureDate(query.departureDate, 30);
  const preliminaryCheckOut = query.returnDate
    ? ensureFutureDate(query.returnDate, 37)
    : formatDateOnly(
        addDays(new Date(checkIn), Math.max(query.nights ?? 5, 1))
      );
  const checkOut =
    preliminaryCheckOut <= checkIn
      ? formatDateOnly(
          addDays(new Date(checkIn), Math.max(query.nights ?? 5, 1))
        )
      : preliminaryCheckOut;

  const hotelIds = await fetchHotelIds(cityCode);
  if (!hotelIds.length) {
    return [];
  }

  let hotelsData: NonNullable<AmadeusHotelOffersResponse["data"]> = [];

  try {
    const response = await amadeusGet<AmadeusHotelOffersResponse>(
      "/v3/shopping/hotel-offers",
      {
        hotelIds: hotelIds.join(","),
        checkInDate: checkIn,
        checkOutDate: checkOut,
        adults: Math.min(query.passengers, 9),
        roomQuantity: 1,
        currency: query.budget?.currency,
        bestRateOnly: "true",
      }
    );
    hotelsData = response.data ?? [];
  } catch (error) {
    console.warn("Amadeus hotel offers lookup failed", {
      error,
      cityCode,
      hotelIds,
      checkIn,
      checkOut,
    });
    return [];
  }

  return hotelsData.slice(0, maxResults).map((result, index) => {
    const offer = result.offers[0];
    const totalAmount = offer?.price?.total
      ? Number.parseFloat(offer.price.total)
      : undefined;
    const currency = (
      offer?.price?.currency ||
      query.budget?.currency ||
      "AUD"
    ).toUpperCase();
    const stayNights =
      query.nights ??
      Math.max(
        Math.ceil(
          (new Date(checkOut).getTime() - new Date(checkIn).getTime()) /
            (24 * 60 * 60 * 1000)
        ),
        1
      );
    const nightlyAmount =
      totalAmount && stayNights
        ? totalAmount / stayNights
        : totalAmount ?? query.budget?.amount ?? 0;

    return {
      id: offer?.id || `hotel-${index}`,
      name: result.hotel.name,
      stars: result.hotel.rating
        ? Number.parseFloat(result.hotel.rating)
        : undefined,
      location: result.hotel.address?.cityName || query.destinationCity,
      addressLine: result.hotel.address?.lines?.[0],
      checkIn: offer?.checkInDate,
      checkOut: offer?.checkOutDate,
      nightlyRate: {
        amount: Number.parseFloat(nightlyAmount.toFixed(2)),
        currency,
      },
      totalPrice: {
        amount:
          totalAmount ?? query.budget?.amount ?? nightlyAmount * stayNights,
        currency,
      },
      amenities: [offer?.boardType, offer?.room?.typeEstimated?.category]
        .filter(Boolean)
        .map((value) => value as string),
      bookingUrl:
        offer?.self ||
        result.hotel.contact?.uri ||
        result.hotel.self ||
        `https://www.google.com/search?q=${encodeURIComponent(
          `${result.hotel.name} ${
            result.hotel.address?.cityName || query.destinationCity
          } hotel`
        )}`,
      amadeus: offer?.id
        ? {
            offerId: offer.id,
            hotelId: result.hotel.self,
            raw: offer,
          }
        : undefined,
    } satisfies LodgingOffer;
  });
}

function uppercase(value: string): string {
  return value.toUpperCase();
}

const FALLBACK_TRAVELER: Required<BookingTraveler> = {
  firstName: "Test",
  lastName: "Passenger",
  dateOfBirth: "1990-01-01",
  email: "traveler@example.com",
  phoneCountryCode: "61",
  phoneNumber: "412345678",
  nationality: "AU",
  passportNumber: "X1234567",
  passportExpiry: "2030-12-31",
  passportIssuanceCountry: "AU",
};

function buildAmadeusTravelerPayload(travelers?: BookingTraveler[]) {
  const source = travelers?.length ? travelers : [FALLBACK_TRAVELER];

  const normalized = source.map((traveler, index) => {
    const base = {
      ...FALLBACK_TRAVELER,
      ...traveler,
    } as Required<BookingTraveler>;
    return {
      id: String(index + 1),
      dateOfBirth: base.dateOfBirth,
      gender: "UNSPECIFIED",
      name: {
        firstName: uppercase(base.firstName),
        lastName: uppercase(base.lastName),
      },
      contact: {
        emailAddress: base.email,
        phones: [
          {
            deviceType: "MOBILE",
            countryCallingCode: base.phoneCountryCode,
            number: base.phoneNumber,
          },
        ],
      },
      documents: [
        {
          documentType: "PASSPORT",
          number: base.passportNumber,
          expiryDate: base.passportExpiry,
          issuanceCountry: base.passportIssuanceCountry,
          nationality: base.nationality,
          holder: true,
        },
      ],
    };
  });

  const primaryBase = {
    ...FALLBACK_TRAVELER,
    ...source[0],
  } as Required<BookingTraveler>;

  const bookingContact = {
    addresseeName: {
      firstName: uppercase(primaryBase.firstName),
      lastName: uppercase(primaryBase.lastName),
    },
    companyName: "Travel-AI",
    purpose: "STANDARD",
    phones: [
      {
        deviceType: "MOBILE",
        countryCallingCode: primaryBase.phoneCountryCode,
        number: primaryBase.phoneNumber,
      },
    ],
    emailAddress: primaryBase.email,
    address: {
      lines: ["123 Demo Street"],
      postalCode: "2000",
      cityName: "Sydney",
      countryCode:
        primaryBase.passportIssuanceCountry || primaryBase.nationality || "AU",
    },
  };

  return {
    travelers: normalized,
    bookingContact,
    primaryBase,
  };
}

export async function priceAmadeusFlightOffer(
  flightOffer: unknown
): Promise<AmadeusFlightPricingResponse | null> {
  if (!isAmadeusConfigured() || !flightOffer) {
    return null;
  }

  return amadeusPost<AmadeusFlightPricingResponse>(
    "/v2/shopping/flight-offers/pricing",
    {
      data: {
        type: "flight-offers-pricing",
        flightOffers: [flightOffer],
      },
    }
  );
}

interface CreateFlightOrderOptions {
  pricedFlightOffer: unknown;
  travelers?: BookingTraveler[];
}

export async function createAmadeusFlightOrder({
  pricedFlightOffer,
  travelers,
}: CreateFlightOrderOptions): Promise<AmadeusFlightOrderResponse | null> {
  if (!isAmadeusConfigured() || !pricedFlightOffer) {
    return null;
  }

  const { travelers: amadeusTravelers, bookingContact } =
    buildAmadeusTravelerPayload(travelers);

  return amadeusPost<AmadeusFlightOrderResponse>("/v1/booking/flight-orders", {
    data: {
      type: "flight-order",
      flightOffers: [pricedFlightOffer],
      travelers: amadeusTravelers,
      remarks: {
        general: [
          {
            subType: "GENERAL_MISCELLANEOUS",
            text: "Travel-AI sandbox booking",
          },
        ],
      },
      ticketingAgreement: {
        option: "DELAY_TO_CANCEL",
        delay: "6D",
      },
      contacts: [bookingContact],
    },
  });
}

interface BookHotelOfferOptions {
  offerId: string;
  travelers?: BookingTraveler[];
}

export async function bookAmadeusHotelOffer({
  offerId,
  travelers,
}: BookHotelOfferOptions): Promise<AmadeusHotelBookingResponse | null> {
  if (!isAmadeusConfigured() || !offerId) {
    return null;
  }

  const { travelers: amadeusTravelers, bookingContact } =
    buildAmadeusTravelerPayload(travelers);
  const primaryTraveler = amadeusTravelers[0];
  const primaryPhone = bookingContact.phones[0];
  const phoneE164 = primaryPhone
    ? `+${primaryPhone.countryCallingCode}${primaryPhone.number}`
    : "+61212345678";

  return amadeusPost<AmadeusHotelBookingResponse>(
    "/v1/booking/hotel-bookings",
    {
      data: {
        offerId,
        guests: [
          {
            id: 1,
            name: {
              firstName: primaryTraveler.name.firstName,
              lastName: primaryTraveler.name.lastName,
            },
            contact: {
              phone: phoneE164,
              email: bookingContact.emailAddress,
            },
          },
        ],
        payments: [
          {
            id: 1,
            method: "creditCard",
            card: {
              vendorCode: "VI",
              cardNumber: "4111111111111111",
              expiryDate: "2028-08",
            },
          },
        ],
        roomAssociations: [
          {
            guestId: 1,
            roomId: 1,
          },
        ],
      },
    }
  );
}
