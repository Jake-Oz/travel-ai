import type {
  BookingConfirmationPayload,
  BookingResponse,
} from "@/lib/types/travel";

export async function bookingAgentConfirm(
  payload: BookingConfirmationPayload
): Promise<BookingResponse> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  const confirmationNumber = `CONF-${
    payload.itineraryId.split("-").pop()?.toUpperCase() ?? "ITIN"
  }-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  return {
    confirmationNumber,
    status: "confirmed",
    itineraryId: payload.itineraryId,
    itineraryHeadline: payload.itineraryHeadline,
    chargedAmount: payload.chargedAmount,
    paymentIntentId: payload.paymentIntentId,
    customerEmail: payload.customerEmail,
    customerName: payload.customerName,
    flight: payload.flight,
    stay: payload.stay,
    bookingTimestamp: new Date().toISOString(),
  };
}
