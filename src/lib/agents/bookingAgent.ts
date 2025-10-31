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
} from "@/lib/services/amadeus";

export async function bookingAgentConfirm(
  payload: BookingConfirmationPayload
): Promise<BookingResponse> {
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
    try {
      const pricing = await priceAmadeusFlightOffer(payload.amadeusFlightOffer);
      const pricedOffer = pricing?.data?.flightOffers?.[0];
      if (!pricedOffer) {
        throw new Error("Amadeus pricing response missing flight offer");
      }

      const order = await createAmadeusFlightOrder({
        pricedFlightOffer: pricedOffer,
        travelers: payload.travelers,
      });

      if (!order?.data?.id) {
        throw new Error("Amadeus flight order creation failed");
      }

      flightOrderId = order.data.id;
      flightOrder = order;
    } catch (error) {
      const message = extractAmadeusMessage(
        error,
        "Amadeus flight booking failed"
      );
      console.error("Amadeus flight booking failed", {
        error,
        category:
          error instanceof AmadeusApiError ? error.category : "unexpected",
        status: error instanceof AmadeusApiError ? error.status : undefined,
      });
      amadeusFlightOrderError = message;
      status = "pending";
      if (error instanceof AmadeusApiError && error.category === "auth") {
        amadeusAvailable = false;
      }
    }
  }

  if (amadeusAvailable && payload.amadeusHotelOffer?.offerId) {
    try {
      const booking = await bookAmadeusHotelOffer({
        offerId: payload.amadeusHotelOffer.offerId,
        travelers: payload.travelers,
      });

      if (!booking?.data?.id) {
        throw new Error("Amadeus hotel booking failed");
      }

      hotelReservationId =
        booking.data.providerConfirmationId ?? booking.data.id;
      hotelBooking = booking;
    } catch (error) {
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
      if (error instanceof AmadeusApiError && error.category === "auth") {
        amadeusAvailable = false;
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
    return error.userMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
