import type { BookingResponse } from "@/lib/types/travel";

export async function bookingAgentConfirm(
  itineraryId: string,
): Promise<BookingResponse> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  return {
    confirmationNumber: `CONF-${itineraryId.split("-").pop()?.toUpperCase() ?? "ITIN"}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`,
    status: "confirmed",
  };
}
