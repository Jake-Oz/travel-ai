import { NextResponse } from "next/server";

import { bookingAgentConfirm } from "@/lib/agents/bookingAgent";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { itineraryId?: string };

    if (!body?.itineraryId) {
      return NextResponse.json(
        { error: "Missing itineraryId" },
        { status: 400 }
      );
    }

    const receipt = await bookingAgentConfirm(body.itineraryId);
    return NextResponse.json(receipt);
  } catch (error) {
    console.error("Booking API error", error);
    return NextResponse.json(
      { error: "Unable to finalize booking" },
      { status: 500 }
    );
  }
}
