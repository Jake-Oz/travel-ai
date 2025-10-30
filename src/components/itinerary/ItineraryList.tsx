"use client";

import type { ItineraryPackage } from "@/lib/types/travel";
import type { SearchPhase } from "@/store/searchStore";

import { ItineraryCard } from "@/components/itinerary/ItineraryCard";

interface ItineraryListProps {
  itineraries: ItineraryPackage[];
  phase: SearchPhase;
  error?: string;
  onSelect?: (itinerary: ItineraryPackage) => void;
}

export function ItineraryList({ itineraries, phase, error, onSelect }: ItineraryListProps) {
  if (phase === "idle") {
    return (
      <div className="rounded-3xl border border-dashed border-slate-700/60 bg-slate-950/40 p-10 text-center text-sm text-slate-400">
        Ask Travel-AI for a trip and the coordinated agents will present curated itineraries here.
      </div>
    );
  }

  if (phase === "searching") {
    return (
      <div className="rounded-3xl border border-slate-800/40 bg-slate-950/60 p-10 text-center text-sm text-slate-300">
        Coordinating agents, parsing itineraries, and ranking results...
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-3xl border border-rose-600/40 bg-rose-950/40 p-10 text-center text-sm text-rose-200">
        {error || "Something went wrong. Please try again."}
      </div>
    );
  }

  if (!itineraries.length) {
    return (
      <div className="rounded-3xl border border-slate-800/40 bg-slate-950/60 p-10 text-center text-sm text-slate-300">
        No itineraries matched the current criteria. Try adjusting your request.
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {itineraries.map((itinerary) => (
        <ItineraryCard
          key={itinerary.id}
          itinerary={itinerary}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
