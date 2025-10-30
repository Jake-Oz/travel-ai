import { NextResponse } from "next/server";

import { runTravelSearch } from "@/lib/coordinator";
import type { NaturalLanguageSearchRequest } from "@/lib/types/travel";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<NaturalLanguageSearchRequest>;

    if (!payload?.query || typeof payload.query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 },
      );
    }

    const data = await runTravelSearch({
      query: payload.query,
      preferences: payload.preferences,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Search API error", error);
    return NextResponse.json(
      { error: "Failed to execute search" },
      { status: 500 },
    );
  }
}
