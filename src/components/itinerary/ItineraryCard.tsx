import type { ItineraryPackage } from "@/lib/types/travel";
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
} from "@/lib/utils/format";

interface ItineraryCardProps {
  itinerary: ItineraryPackage;
  onSelect?: (itinerary: ItineraryPackage) => void;
}

export function ItineraryCard({ itinerary, onSelect }: ItineraryCardProps) {
  const { flight, lodging, totalPrice, priceBreakdown } = itinerary;
  const firstLeg = flight.legs[0];
  const lastLeg = flight.legs[flight.legs.length - 1];

  return (
    <article className="group rounded-3xl border border-slate-800/40 bg-slate-950/60 p-6 transition hover:border-emerald-500/40 hover:shadow-xl hover:shadow-emerald-500/10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">
            {itinerary.headline}
          </h3>
          <p className="mt-1 text-sm text-slate-400">{itinerary.summary}</p>
        </div>
        <div className="rounded-2xl bg-emerald-500/10 px-4 py-2 text-right">
          <span className="block text-xs uppercase tracking-wide text-emerald-300">
            Total
          </span>
          <span className="text-lg font-semibold text-emerald-200">
            {formatCurrency(totalPrice.amount, totalPrice.currency)}
          </span>
          {priceBreakdown && (
            <span className="mt-1 block text-[11px] text-emerald-200/80">
              Flight {formatCurrency(
                priceBreakdown.flight.amount,
                priceBreakdown.flight.currency
              )}
              {" "}· Stay {formatCurrency(
                priceBreakdown.lodging.amount,
                priceBreakdown.lodging.currency
              )}
            </span>
          )}
          {priceBreakdown && !priceBreakdown.currencyConsistent && (
            <span className="mt-1 block text-[11px] text-amber-300/80">
              Currency mismatch between flight and stay—double check before
              booking.
            </span>
          )}
        </div>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800/30 bg-slate-900/40 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Flight
          </h4>
          <div className="mt-3 flex flex-col gap-2 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-100">
                {flight.airline} {flight.flightNumber}
              </span>
              <span className="rounded-full bg-slate-800/60 px-3 py-1 text-xs uppercase tracking-wide text-slate-200">
                {flight.stops === 0
                  ? "Nonstop"
                  : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
              <div>
                <p className="font-semibold text-slate-300">Depart</p>
                <p>{formatDateTime(firstLeg.departureTime)}</p>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">
                  {firstLeg.departureAirport}
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-300">Arrive</p>
                <p>{formatDateTime(lastLeg.arrivalTime)}</p>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">
                  {lastLeg.arrivalAirport}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Duration {formatDuration(flight.durationMinutes)} · Cabin{" "}
              {flight.class.replace("_", " ")}
            </p>
            <p className="text-xs text-slate-500">{flight.baggageAllowance}</p>
            {flight.legs.length > 1 && (
              <div className="mt-2 rounded-xl border border-slate-800/40 bg-slate-900/70 p-3 text-xs text-slate-400">
                <p className="font-semibold text-slate-300">Route details</p>
                <ol className="mt-2 space-y-2">
                  {flight.legs.map((leg, index) => (
                    <li
                      key={`${leg.departureAirport}-${leg.arrivalAirport}-${index}`}
                      className="flex flex-col gap-0.5"
                    >
                      <span className="font-medium text-slate-200">
                        {leg.departureAirport} → {leg.arrivalAirport}
                      </span>
                      <span>
                        {formatDateTime(leg.departureTime)} to{" "}
                        {formatDateTime(leg.arrivalTime)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800/30 bg-slate-900/40 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Stay
          </h4>
          <div className="mt-3 flex flex-col gap-2 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-100">
                {lodging.name}
              </span>
              <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                {lodging.stars ? `${lodging.stars.toFixed(1)}*` : "Boutique"}
              </span>
            </div>
            <p className="text-xs text-slate-400">{lodging.location}</p>
            <p className="text-xs text-slate-500">Check-in {lodging.checkIn}</p>
            {lodging.checkOut && (
              <p className="text-xs text-slate-500">
                Check-out {lodging.checkOut}
              </p>
            )}
            <div className="text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Nightly</span>{" "}
              {formatCurrency(
                lodging.nightlyRate.amount,
                lodging.nightlyRate.currency
              )}
            </div>
            {lodging.amenities && (
              <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-slate-500">
                {lodging.amenities.map((amenity) => (
                  <span
                    key={amenity}
                    className="rounded-full bg-slate-800/40 px-2 py-1"
                  >
                    {amenity}
                  </span>
                ))}
              </div>
            )}
            {lodging.bookingUrl && (
              <a
                href={lodging.bookingUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300 transition hover:bg-emerald-500/10"
              >
                View property site
                <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </section>
      </div>

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-slate-500">
          {itinerary.tags?.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-slate-800/40 px-3 py-1 text-slate-300"
            >
              {tag}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onSelect?.(itinerary)}
          className="inline-flex items-center rounded-full border border-emerald-400 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-300 transition hover:bg-emerald-500/10"
        >
          Book with Apple Pay
        </button>
      </footer>
    </article>
  );
}
