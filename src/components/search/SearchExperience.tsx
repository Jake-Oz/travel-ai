"use client";

import { useCallback, useEffect, useState } from "react";

import type { BookingResponse, ItineraryPackage } from "@/lib/types/travel";
import { BookingSheet } from "@/components/booking/BookingSheet";
import { SearchForm } from "@/components/search/SearchForm";
import { AgentTimeline } from "@/components/status/AgentTimeline";
import { ItineraryList } from "@/components/itinerary/ItineraryList";
import { useSearchStore } from "@/store/searchStore";
import { formatCurrency } from "@/lib/utils/format";

export function SearchExperience() {
  const phase = useSearchStore((state) => state.phase);
  const itineraries = useSearchStore((state) => state.itineraries);
  const trace = useSearchStore((state) => state.trace);
  const error = useSearchStore((state) => state.error);

  const [selectedItinerary, setSelectedItinerary] =
    useState<ItineraryPackage | null>(null);
  const [receipt, setReceipt] = useState<BookingResponse | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmedItinerary, setConfirmedItinerary] =
    useState<ItineraryPackage | null>(null);
  const [isReceiptVisible, setIsReceiptVisible] = useState(false);

  const stripeMode = (process.env.NEXT_PUBLIC_STRIPE_MODE ?? "test").toLowerCase();
  const isStripeTestMode = stripeMode === "test";

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
    setConfirmedItinerary(selectedItinerary);
    setIsReceiptVisible(true);
    setSelectedItinerary(null);
  }, [selectedItinerary]);

  const handleBookingError = useCallback((message: string) => {
    setBookingError(message);
  }, []);

  useEffect(() => {
    if (!isReceiptVisible) return;

    const timer = setTimeout(() => {
      setIsReceiptVisible(false);
      setReceipt(null);
      setConfirmedItinerary(null);
    }, 8000);

    return () => clearTimeout(timer);
  }, [isReceiptVisible]);

  const handleDismissReceipt = useCallback(() => {
    setIsReceiptVisible(false);
    setReceipt(null);
    setConfirmedItinerary(null);
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
          {isReceiptVisible && receipt && confirmedItinerary && (
            <div className="overflow-hidden rounded-3xl border border-emerald-400/60 bg-emerald-600/15 p-6 shadow-lg shadow-emerald-900/20 transition-all duration-300">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-100">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-6 w-6"
                      role="img"
                      aria-label="Booking confirmed"
                    >
                      <path
                        d="M9.00065 16.2L4.80065 12L3.40065 13.4L9.00065 19L21.0007 7.00003L19.6007 5.60003L9.00065 16.2Z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                      Booking confirmed
                    </p>
                    <h3 className="text-lg font-semibold text-emerald-100">
                      {confirmedItinerary.headline}
                    </h3>
                    {receipt.confirmationNumber && (
                      <p className="text-sm text-emerald-200">
                        Reference {receipt.confirmationNumber}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDismissReceipt}
                  className="rounded-full border border-emerald-400/50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:border-emerald-300 hover:text-emerald-100"
                >
                  Dismiss
                </button>
              </div>

              <div className="mt-5 grid gap-4 text-sm text-emerald-50 sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-emerald-300">
                    Quoted total
                  </dt>
                  <dd>{formatCurrency(confirmedItinerary.totalPrice.amount, confirmedItinerary.totalPrice.currency)}</dd>
                  {isStripeTestMode && (
                    <p className="mt-1 text-[11px] text-emerald-300/80">
                      Test mode authorised AUD 1.00 on your card; no funds are captured.
                    </p>
                  )}
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-emerald-300">
                    Flight
                  </dt>
                  <dd>
                    {confirmedItinerary.flight.airline} {confirmedItinerary.flight.flightNumber}
                  </dd>
                  <p className="text-[11px] text-emerald-200/80">
                    {confirmedItinerary.flight.legs[0]?.departureAirport} →
                    {" "}
                    {confirmedItinerary.flight.legs[confirmedItinerary.flight.legs.length - 1]?.arrivalAirport}
                  </p>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-emerald-300">
                    Stay
                  </dt>
                  <dd>{confirmedItinerary.lodging.name}</dd>
                  <p className="text-[11px] text-emerald-200/80">
                    {confirmedItinerary.lodging.location}
                  </p>
                </div>
              </div>

              {confirmedItinerary.lodging.checkIn && confirmedItinerary.lodging.checkOut && (
                <p className="mt-4 text-xs text-emerald-200/80">
                  Stay window {confirmedItinerary.lodging.checkIn} → {confirmedItinerary.lodging.checkOut}
                </p>
              )}
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
