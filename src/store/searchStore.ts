"use client";

import { create } from "zustand";

import type {
  AgentTrace,
  ItineraryPackage,
  NaturalLanguageSearchRequest,
  SearchApiResponse,
} from "@/lib/types/travel";

export type SearchPhase = "idle" | "searching" | "results" | "error";

interface SearchState {
  phase: SearchPhase;
  query: string;
  isSubmitting: boolean;
  itineraries: ItineraryPackage[];
  trace: AgentTrace[];
  error?: string;
  submit: (payload: NaturalLanguageSearchRequest) => Promise<SearchApiResponse | undefined>;
  reset: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  phase: "idle",
  query: "",
  isSubmitting: false,
  itineraries: [],
  trace: [],
  error: undefined,
  async submit(payload) {
    set({ phase: "searching", isSubmitting: true, error: undefined, query: payload.query });

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Search failed");
      }

      const data = (await response.json()) as SearchApiResponse;
      set({
        phase: "results",
        isSubmitting: false,
        itineraries: data.itineraries,
        trace: data.trace,
      });
      return data;
    } catch (error) {
      set({
        phase: "error",
        isSubmitting: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return undefined;
    }
  },
  reset() {
    set({
      phase: "idle",
      isSubmitting: false,
      itineraries: [],
      trace: [],
      error: undefined,
    });
  },
}));
