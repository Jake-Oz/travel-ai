"use client";

import { useState } from "react";

import type { TravelClass } from "@/lib/types/travel";
import { useSearchStore } from "@/store/searchStore";

const travelClassOptions: { label: string; value: TravelClass }[] = [
  { label: "Economy", value: "economy" },
  { label: "Premium", value: "premium_economy" },
  { label: "Business", value: "business" },
  { label: "First", value: "first" },
];

export function SearchForm() {
  const submit = useSearchStore((state) => state.submit);
  const isSubmitting = useSearchStore((state) => state.isSubmitting);
  const [query, setQuery] = useState(
    "Find me an economy class flight from London to Paris next week and a 4-star hotel in Paris for 5 nights"
  );
  const [travelClass, setTravelClass] = useState<TravelClass>("business");
  const [passengers, setPassengers] = useState(1);
  const [nights, setNights] = useState(5);
  const [hotelLocation, setHotelLocation] = useState("Paris");
  const [hotelStars, setHotelStars] = useState(4);
  const [budget, setBudget] = useState("6000");
  const [currency, setCurrency] = useState("AUD");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const budgetAmount = budget ? Number.parseInt(budget, 10) : undefined;
    await submit({
      query,
      preferences: {
        travelClass,
        passengers,
        nights,
        hotelLocation: hotelLocation || undefined,
        hotelStars,
        budget:
          budgetAmount && budgetAmount > 0
            ? {
                amount: budgetAmount,
                currency,
              }
            : undefined,
      },
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-slate-800/20 bg-slate-900/60 p-6 shadow-xl shadow-slate-900/20 backdrop-blur-xl"
    >
      <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-slate-300">
        Describe your trip
      </label>
      <textarea
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        rows={4}
        className="w-full rounded-2xl border border-slate-700/60 bg-slate-950/60 p-4 text-base text-slate-100 shadow-inner outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
        placeholder="Write a natural language request"
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Cabin class
          </label>
          <div className="grid grid-cols-2 gap-2">
            {travelClassOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTravelClass(option.value)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  travelClass === option.value
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                    : "border-slate-700/70 bg-slate-900/60 text-slate-400 hover:border-slate-500"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Travelers
            </label>
            <input
              type="number"
              min={1}
              value={passengers}
              onChange={(event) =>
                setPassengers(Number.parseInt(event.target.value || "1", 10))
              }
              className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 p-3 text-center text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Nights
            </label>
            <input
              type="number"
              min={1}
              value={nights}
              onChange={(event) =>
                setNights(Number.parseInt(event.target.value || "1", 10))
              }
              className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 p-3 text-center text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Stars
            </label>
            <input
              type="number"
              min={1}
              max={5}
              step={0.5}
              value={hotelStars}
              onChange={(event) =>
                setHotelStars(Number.parseFloat(event.target.value || "4"))
              }
              className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 p-3 text-center text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Preferred area
          </label>
          <input
            type="text"
            value={hotelLocation}
            onChange={(event) => setHotelLocation(event.target.value)}
            className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 p-3 text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
            placeholder="Shinjuku, NYC Midtown, etc."
          />
        </div>

        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Budget
            </label>
            <input
              type="number"
              min={0}
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 p-3 text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
              placeholder="6000"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Currency
            </label>
            <input
              type="text"
              maxLength={3}
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value.toUpperCase())
              }
              className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 p-3 text-center text-slate-100 uppercase outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">
          Travel-AI uses orchestrated agents to search flights, hotels, and
          pricing in real time.
        </p>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-700/40"
        >
          {isSubmitting ? "Searching..." : "Generate itineraries"}
        </button>
      </div>
    </form>
  );
}
