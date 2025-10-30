"use client";

import { useCallback, useState } from "react";

import type { BookingResponse, ItineraryPackage } from "@/lib/types/travel";
import { BookingSheet } from "@/components/booking/BookingSheet";
import { SearchForm } from "@/components/search/SearchForm";
import { AgentTimeline } from "@/components/status/AgentTimeline";
import { ItineraryList } from "@/components/itinerary/ItineraryList";
import { useSearchStore } from "@/store/searchStore";

export function SearchExperience() {
  const phase = useSearchStore((state) => state.phase);
  const itineraries = useSearchStore((state) => state.itineraries);
  const trace = useSearchStore((state) => state.trace);
  const error = useSearchStore((state) => state.error);

  const [selectedItinerary, setSelectedItinerary] =
    useState<ItineraryPackage | null>(null);
  const [receipt, setReceipt] = useState<BookingResponse | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const handleSelect = useCallback((itinerary: ItineraryPackage) => {
    setReceipt(null);
    setBookingError(null);
    setSelectedItinerary(itinerary);
  }, []);

  const handleCloseSheet = useCallback(() => {
    setSelectedItinerary(null);
  }, []);

  const handleBookingSuccess = useCallback((confirmation: BookingResponse) => {
    setReceipt(confirmation);
    setBookingError(null);
    setSelectedItinerary(null);
  }, []);

  const handleBookingError = useCallback((message: string) => {
    setBookingError(message);
  }, []);

  return (
    <div className="space-y-6">
      <SearchForm />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <AgentTimeline trace={trace} phase={phase} />
        <div className="space-y-6">
          <ItineraryList
            itineraries={itineraries}
            phase={phase}
            error={error}
            onSelect={handleSelect}
          />
          {receipt && (
            <div className="rounded-3xl border border-emerald-400/60 bg-emerald-500/10 p-6 text-sm text-emerald-100">
              Booking confirmed. Confirmation number{" "}
              {receipt.confirmationNumber}.
            </div>
          )}
          {bookingError && (
            <div className="rounded-3xl border border-rose-600/40 bg-rose-950/40 p-6 text-sm text-rose-100">
              {bookingError}
            </div>
          )}
        </div>
      </div>
      {selectedItinerary && (
        <BookingSheet
          itinerary={selectedItinerary}
          onClose={handleCloseSheet}
          onSuccess={handleBookingSuccess}
          onError={handleBookingError}
        />
      )}
    </div>
  );
}
