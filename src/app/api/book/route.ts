import { NextResponse } from "next/server";

import { bookingAgentConfirm } from "@/lib/agents/bookingAgent";
import { sendBookingConfirmationEmail } from "@/lib/services/mailer";
import { persistBooking } from "@/lib/services/bookingPersistence";
import type { BookingConfirmationPayload } from "@/lib/types/travel";

interface BookingRequestBody {
  itineraryId?: string;
  itineraryHeadline?: string;
  amount?: number;
  currency?: string;
  paymentIntentId?: string;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  flight?: {
    airline: string;
    flightNumber: string;
    departureAirport?: string;
    arrivalAirport?: string;
    departureTime?: string;
    arrivalTime?: string;
  };
  stay?: {
    name: string;
    location?: string;
    checkIn?: string;
    checkOut?: string;
  };
  travelers?: Array<{
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    email?: string;
    phoneCountryCode?: string;
    phoneNumber?: string;
    nationality?: string;
    passportNumber?: string;
    passportExpiry?: string;
    passportIssuanceCountry?: string;
  }>;
  amadeusFlightOffer?: unknown;
  amadeusHotelOffer?: {
    offerId: string;
    hotelId?: string;
    raw?: unknown;
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BookingRequestBody;

    if (!body?.itineraryId || !body.itineraryHeadline) {
      return NextResponse.json(
        { error: "Missing itineraryId or itineraryHeadline" },
        { status: 400 }
      );
    }

    if (!body.amount || !body.currency) {
      return NextResponse.json(
        { error: "Missing amount or currency" },
        { status: 400 }
      );
    }

    const payload: BookingConfirmationPayload = {
      itineraryId: body.itineraryId,
      itineraryHeadline: body.itineraryHeadline,
      chargedAmount: {
        amount: body.amount,
        currency: body.currency.toUpperCase(),
      },
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      paymentIntentId: body.paymentIntentId,
      flight: body.flight,
      stay: body.stay,
      travelers: body.travelers,
      amadeusFlightOffer: body.amadeusFlightOffer,
      amadeusHotelOffer: body.amadeusHotelOffer,
    };

    if (!payload.travelers?.length) {
      return NextResponse.json(
        { error: "Traveller details are required to complete booking." },
        { status: 400 }
      );
    }

    const travelerIssue = payload.travelers
      .map((traveler, index) => {
        const missing: string[] = [];
        if (!traveler.firstName?.trim()) missing.push("firstName");
        if (!traveler.lastName?.trim()) missing.push("lastName");
        if (!traveler.travelerType) missing.push("travelerType");
        if (!traveler.dateOfBirth) missing.push("dateOfBirth");
        if (!traveler.email) missing.push("email");
        if (!traveler.phoneCountryCode || !traveler.phoneNumber)
          missing.push("phone");
        if (!traveler.nationality) missing.push("nationality");
        if (!traveler.passportNumber) missing.push("passportNumber");
        if (!traveler.passportExpiry) missing.push("passportExpiry");
        if (!traveler.passportIssuanceCountry)
          missing.push("passportIssuanceCountry");
        return missing.length
          ? { index: index + 1, missing }
          : null;
      })
      .find((issue): issue is { index: number; missing: string[] } => issue !== null);

    if (travelerIssue) {
      return NextResponse.json(
        {
          error: `Traveller ${travelerIssue.index} is missing required fields: ${travelerIssue.missing.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const receipt = await bookingAgentConfirm(payload);

    try {
      await persistBooking({ payload, receipt });
    } catch (error) {
      console.error("Booking persistence failed", error);
    }

    await sendBookingConfirmationEmail({ receipt });

    return NextResponse.json(receipt);
  } catch (error) {
    console.error("Booking API error", error);
    return NextResponse.json(
      { error: "Unable to finalize booking" },
      { status: 500 }
    );
  }
}
