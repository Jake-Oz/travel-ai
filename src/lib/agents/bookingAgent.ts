import type {
  BookingConfirmationPayload,
  BookingResponse,
} from "@/lib/types/travel";
import {
  bookAmadeusHotelOffer,
  createAmadeusFlightOrder,
  isAmadeusConfigured,
  priceAmadeusFlightOffer,
  AmadeusApiError,
  AmadeusTravelPartyMismatchError,
} from "@/lib/services/amadeus";

const MAX_FLIGHT_ORDER_ATTEMPTS = 3;
const FLIGHT_ORDER_RETRY_BASE_DELAY_MS = 800;
const MAX_HOTEL_ORDER_ATTEMPTS = 3;
const HOTEL_ORDER_RETRY_BASE_DELAY_MS = 800;

export async function bookingAgentConfirm(
  payload: BookingConfirmationPayload
): Promise<BookingResponse> {
  if (!payload.travelers?.length) {
    throw new Error("Traveller details are required to finalize booking.");
  }

  const amadeusEnabled = isAmadeusConfigured();
  let amadeusAvailable = amadeusEnabled;
  const chargedAmount = payload.chargedAmount;
  let flightOrderId: string | undefined;
  let hotelReservationId: string | undefined;
  let flightOrder: unknown;
  let hotelBooking: unknown;

  let amadeusFlightOrderError: string | undefined;
  let amadeusHotelBookingError: string | undefined;
  let status: BookingResponse["status"] = "confirmed";
  if (amadeusAvailable && payload.amadeusFlightOffer) {
    const attemptFlightBooking = async (
      strategy: "default" | "compatibility" = "default",
      attempt = 1
    ): Promise<Awaited<ReturnType<typeof createAmadeusFlightOrder>>> => {
      try {
        const pricing = await priceAmadeusFlightOffer(
          payload.amadeusFlightOffer,
          { strategy }
        );
        const pricedOffer = pricing?.data?.flightOffers?.[0];
        if (!pricedOffer) {
          throw new Error("Amadeus pricing response missing flight offer");
        }

        ensureFlightTravelerCapacity(pricedOffer, payload.travelers);

        return await createAmadeusFlightOrder({
          pricedFlightOffer: pricedOffer,
          travelers: payload.travelers,
        });
      } catch (attemptError) {
        if (
          attemptError instanceof AmadeusApiError &&
          attemptError.category === "server" &&
          attempt < MAX_FLIGHT_ORDER_ATTEMPTS
        ) {
          const delayMs =
            FLIGHT_ORDER_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(
            "Amadeus flight order returned server error. Retrying.",
            {
              attempt,
              delayMs,
              status: attemptError.status,
              requestPath: attemptError.requestPath,
            }
          );
          await wait(delayMs);
          return attemptFlightBooking(strategy, attempt + 1);
        }

        throw attemptError;
      }
    };

    try {
      const order = await attemptFlightBooking();

      if (!order?.data?.id) {
        throw new Error("Amadeus flight order creation failed");
      }

      flightOrderId = order.data.id;
      flightOrder = order;
    } catch (error) {
      if (error instanceof AmadeusTravelPartyMismatchError) {
        amadeusFlightOrderError = error.message;
        status = "pending";
        console.warn(
          "Amadeus flight booking aborted due to traveller mismatch",
          {
            supported: error.supportedCount,
            requested: error.requestedCount,
          }
        );
        amadeusAvailable = false;
      } else {
        let handled = false;
        let failure: unknown = error;

        if (
          error instanceof AmadeusApiError &&
          isTravelerNotPricedError(error)
        ) {
          const requestedCount = Math.max(1, payload.travelers.length);
          const supportedCount = Math.max(
            1,
            pricedTravelerCountFromError(error) ??
              extractTravelerPricingCount(payload.amadeusFlightOffer) ??
              requestedCount - 1
          );
          const mismatch = new AmadeusTravelPartyMismatchError(
            "flight",
            supportedCount,
            requestedCount
          );
          amadeusFlightOrderError = mismatch.message;
          status = "pending";
          amadeusAvailable = false;
          handled = true;
          console.warn(
            "Amadeus flight booking aborted: flight offer does not include all travellers",
            {
              supported: mismatch.supportedCount,
              requested: mismatch.requestedCount,
            }
          );
        } else if (error instanceof AmadeusApiError) {
          const primaryCode = error.primaryError?.code;
          const numericCode =
            typeof primaryCode === "string" && primaryCode
              ? Number.parseInt(primaryCode, 10)
              : undefined;
          const isSegmentSellFailure =
            primaryCode === "34651" ||
            numericCode === 34651 ||
            error.primaryError?.title === "SEGMENT SELL FAILURE";

          if (isSegmentSellFailure) {
            console.warn(
              "Amadeus flight booking encountered segment sell failure. Retrying with compatibility pricing."
            );
            try {
              const fallbackOrder = await attemptFlightBooking("compatibility");

              if (!fallbackOrder?.data?.id) {
                throw new Error("Amadeus flight order creation failed");
              }

              flightOrderId = fallbackOrder.data.id;
              flightOrder = fallbackOrder;
              handled = true;
              console.info(
                "Amadeus flight booking succeeded after compatibility repricing"
              );
            } catch (fallbackError) {
              failure = fallbackError;
            }
          }
        }

        if (!handled) {
          const message = extractAmadeusMessage(
            failure,
            "Amadeus flight booking failed"
          );
          console.error("Amadeus flight booking failed", {
            error: failure,
            category:
              failure instanceof AmadeusApiError
                ? failure.category
                : "unexpected",
            status:
              failure instanceof AmadeusApiError ? failure.status : undefined,
          });
          amadeusFlightOrderError = message;
          status = "pending";
          if (
            failure instanceof AmadeusApiError &&
            (failure.category === "auth" || failure.category === "server")
          ) {
            amadeusAvailable = false;
            console.warn("Amadeus disabled for remaining booking steps", {
              category: failure.category,
              status: failure.status,
            });
          }
        }
      }
    }
  }

  if (amadeusAvailable && payload.amadeusHotelOffer?.offerId) {
    const attemptHotelBooking = async (
      attempt = 1
    ): Promise<Awaited<ReturnType<typeof bookAmadeusHotelOffer>>> => {
      try {
        return await bookAmadeusHotelOffer({
          offerId: payload.amadeusHotelOffer?.offerId as string,
          travelers: payload.travelers,
          offer: payload.amadeusHotelOffer?.raw,
        });
      } catch (handlerError) {
        if (
          handlerError instanceof AmadeusApiError &&
          handlerError.category === "server" &&
          attempt < MAX_HOTEL_ORDER_ATTEMPTS
        ) {
          const delayMs =
            HOTEL_ORDER_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn("Amadeus hotel order returned server error. Retrying.", {
            attempt,
            delayMs,
            status: handlerError.status,
            requestPath: handlerError.requestPath,
          });
          await wait(delayMs);
          return attemptHotelBooking(attempt + 1);
        }

        throw handlerError;
      }
    };

    try {
      const booking = await attemptHotelBooking();

      if (!booking?.data?.id) {
        throw new Error("Amadeus hotel booking failed");
      }

      hotelReservationId =
        booking.data.providerConfirmationId ?? booking.data.id;
      hotelBooking = booking;
    } catch (error) {
      if (error instanceof AmadeusTravelPartyMismatchError) {
        amadeusHotelBookingError = error.message;
        status = "pending";
        console.warn(
          "Amadeus hotel booking aborted due to traveller mismatch",
          {
            supported: error.supportedCount,
            requested: error.requestedCount,
          }
        );
        amadeusAvailable = false;
      } else if (
        error instanceof AmadeusApiError &&
        isInvalidHotelGuestError(error)
      ) {
        const requestedCount = Math.max(1, payload.travelers.length);
        const supportedCount = Math.max(
          1,
          inferHotelGuestCapacityFromOffer(payload.amadeusHotelOffer?.raw) ??
            requestedCount - 1
        );
        const mismatch = new AmadeusTravelPartyMismatchError(
          "hotel",
          supportedCount,
          requestedCount
        );
        amadeusHotelBookingError = mismatch.message;
        status = "pending";
        amadeusAvailable = false;
        console.warn(
          "Amadeus hotel booking aborted: hotel offer does not accommodate traveller party",
          {
            supported: mismatch.supportedCount,
            requested: mismatch.requestedCount,
          }
        );
      } else {
        const message = extractAmadeusMessage(
          error,
          "Amadeus hotel booking failed"
        );
        console.error("Amadeus hotel booking failed", {
          error,
          category:
            error instanceof AmadeusApiError ? error.category : "unexpected",
          status: error instanceof AmadeusApiError ? error.status : undefined,
        });
        amadeusHotelBookingError = message;
        status = "pending";
        if (
          error instanceof AmadeusApiError &&
          (error.category === "auth" || error.category === "server")
        ) {
          amadeusAvailable = false;
          console.warn("Amadeus disabled for remaining booking steps", {
            category: error.category,
            status: error.status,
          });
        }
      }
    }
  }

  const confirmationNumber = `CONF-${
    payload.itineraryId.split("-").pop()?.toUpperCase() ?? "ITIN"
  }-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  if (payload.paymentIntentId || flightOrderId || hotelReservationId) {
    console.info("Booking reconciliation snapshot", {
      confirmationNumber,
      paymentIntentId: payload.paymentIntentId,
      amadeusFlightOrderId: flightOrderId,
      amadeusHotelReservationId: hotelReservationId,
    });
  }

  return {
    confirmationNumber,
    status,
    itineraryId: payload.itineraryId,
    itineraryHeadline: payload.itineraryHeadline,
    chargedAmount,
    paymentIntentId: payload.paymentIntentId,
    customerEmail: payload.customerEmail,
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    flight: payload.flight,
    stay: payload.stay,
    travelers: payload.travelers,
    bookingTimestamp: new Date().toISOString(),
    amadeusFlightOrderId: flightOrderId,
    amadeusHotelReservationId: hotelReservationId,
    amadeusFlightOrder: flightOrder,
    amadeusHotelBooking: hotelBooking,
    amadeusFlightOrderError,
    amadeusHotelBookingError,
  };
}

function extractAmadeusMessage(error: unknown, fallback: string): string {
  if (error instanceof AmadeusApiError) {
    const primary = error.primaryError;
    if (primary) {
      const normalizedTitle = (primary.title || "").toUpperCase();
      if (
        primary.code === "34651" ||
        normalizedTitle === "SEGMENT SELL FAILURE"
      ) {
        return "The airline could not confirm seats on one of the selected segments. Please refresh the search to pick a new itinerary.";
      }
    }
    return error.userMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function ensureFlightTravelerCapacity(
  pricedOffer: unknown,
  travelers: BookingConfirmationPayload["travelers"]
) {
  if (!travelers?.length) {
    return;
  }

  const pricedCount = extractTravelerPricingCount(pricedOffer);
  if (pricedCount !== undefined && travelers.length > pricedCount) {
    throw new AmadeusTravelPartyMismatchError(
      "flight",
      Math.max(1, pricedCount),
      travelers.length
    );
  }
}

function extractTravelerPricingCount(pricedOffer: unknown): number | undefined {
  if (!pricedOffer || typeof pricedOffer !== "object") {
    return undefined;
  }

  const travelerPricings = (pricedOffer as { travelerPricings?: unknown[] })
    .travelerPricings;
  if (Array.isArray(travelerPricings)) {
    return travelerPricings.length;
  }

  return undefined;
}

function isTravelerNotPricedError(error: AmadeusApiError): boolean {
  const primary = error.primaryError;
  const detail = (primary?.detail || primary?.title || "").toLowerCase();
  if (detail.includes("not priced")) {
    return true;
  }
  if (primary?.code === "4926") {
    return true;
  }
  const pointer = primary?.source?.pointer;
  return typeof pointer === "string" && pointer.includes("/data/travelers");
}

function pricedTravelerCountFromError(
  error: AmadeusApiError
): number | undefined {
  const pointer = error.primaryError?.source?.pointer;
  if (typeof pointer !== "string") {
    return undefined;
  }
  const match = pointer.match(/travelers\[(\d+)\]/i);
  if (!match) {
    return undefined;
  }
  const index = Number.parseInt(match[1], 10);
  if (Number.isNaN(index)) {
    return undefined;
  }
  return Math.max(0, index);
}

function isInvalidHotelGuestError(error: AmadeusApiError): boolean {
  const primary = error.primaryError;
  if (!primary) {
    return false;
  }
  if (primary.code === "21503") {
    return true;
  }
  const detail = (primary.detail || primary.title || "").toLowerCase();
  return detail.includes("invalid number of guests");
}

function inferHotelGuestCapacityFromOffer(offer: unknown): number | undefined {
  if (!offer || typeof offer !== "object") {
    return undefined;
  }

  const maybeOffer = offer as {
    guests?: { adults?: number };
    room?: { typeEstimated?: { beds?: number } };
    offers?: unknown[];
  };

  const adults = maybeOffer.guests?.adults;
  if (typeof adults === "number" && adults > 0) {
    return adults;
  }

  const beds = maybeOffer.room?.typeEstimated?.beds;
  if (typeof beds === "number" && beds > 0) {
    return beds;
  }

  if (Array.isArray(maybeOffer.offers)) {
    for (const nested of maybeOffer.offers) {
      const nestedCapacity = inferHotelGuestCapacityFromOffer(nested);
      if (typeof nestedCapacity === "number" && nestedCapacity > 0) {
        return nestedCapacity;
      }
    }
  }

  return undefined;
}
