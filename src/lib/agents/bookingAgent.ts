import type {
  BookingConfirmationPayload,
  BookingResponse,
} from "@/lib/types/travel";
import {
  bookAmadeusHotelOffer,
  createAmadeusFlightOrder,
  isAmadeusConfigured,
  priceAmadeusFlightOffer,
} from "@/lib/services/amadeus";

export async function bookingAgentConfirm(
  payload: BookingConfirmationPayload
): Promise<BookingResponse> {
  const amadeusEnabled = isAmadeusConfigured();
  const chargedAmount = payload.chargedAmount;
  let flightOrderId: string | undefined;
  let hotelReservationId: string | undefined;
  let flightOrder: unknown;
  let hotelBooking: unknown;

  let amadeusFlightOrderError: string | undefined;
  let amadeusHotelBookingError: string | undefined;
  let status: BookingResponse["status"] = "confirmed";
  if (amadeusEnabled && payload.amadeusFlightOffer) {
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
      console.error("Amadeus flight booking failed", error);
      amadeusFlightOrderError =
        error instanceof Error
          ? error.message
          : "Amadeus flight booking failed";
      status = "pending";
    }
  }

  if (amadeusEnabled && payload.amadeusHotelOffer?.offerId) {
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
      console.error("Amadeus hotel booking failed", error);
      amadeusHotelBookingError =
        error instanceof Error ? error.message : "Amadeus hotel booking failed";
      status = "pending";
    }
  }

  const confirmationNumber = `CONF-${
    payload.itineraryId.split("-").pop()?.toUpperCase() ?? "ITIN"
  }-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

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
