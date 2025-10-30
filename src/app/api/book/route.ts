import { NextResponse } from "next/server";

import { bookingAgentConfirm } from "@/lib/agents/bookingAgent";
import { sendBookingConfirmationEmail } from "@/lib/services/mailer";

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

    const receipt = await bookingAgentConfirm({
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
    });

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
