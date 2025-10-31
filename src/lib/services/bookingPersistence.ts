import type {
  BookingConfirmationPayload,
  BookingResponse,
  BookingTraveler,
} from "@/lib/types/travel";

import { prisma } from "./prisma";

type PersistBookingInput = {
  payload: BookingConfirmationPayload;
  receipt: BookingResponse;
};

function toCurrencyCode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().toUpperCase().slice(0, 3);
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value}T00:00:00Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseIsoDateTime(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapTraveler(traveler: BookingTraveler) {
  return {
    firstName: traveler.firstName.trim(),
    lastName: traveler.lastName.trim(),
    dateOfBirth: parseIsoDate(traveler.dateOfBirth ?? undefined) ?? undefined,
    email: traveler.email?.trim() || undefined,
    phoneCountryCode: traveler.phoneCountryCode || undefined,
    phoneNumber: traveler.phoneNumber || undefined,
    nationality: traveler.nationality?.trim().toUpperCase().slice(0, 2),
    passportNumber: traveler.passportNumber?.trim() || undefined,
    passportExpiry:
      parseIsoDate(traveler.passportExpiry ?? undefined) ?? undefined,
    passportIssuanceCountry: traveler.passportIssuanceCountry
      ?.trim()
      .toUpperCase()
      .slice(0, 2),
  };
}

function toJsonField(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn("Booking persistence could not serialize JSON payload", error);
    return undefined;
  }
}

export async function persistBooking({
  payload,
  receipt,
}: PersistBookingInput): Promise<void> {
  const resolvedCurrency =
    toCurrencyCode(receipt.chargedAmount.currency) ??
    toCurrencyCode(payload.chargedAmount.currency) ??
    "USD";
  const resolvedAmount = Number.isFinite(receipt.chargedAmount.amount)
    ? receipt.chargedAmount.amount
    : payload.chargedAmount.amount;
  const chargedAmountValue = resolvedAmount.toFixed(2);

  const travelers = (receipt.travelers ?? payload.travelers ?? []).map(
    mapTraveler
  );

  const statusValue: "CONFIRMED" | "PENDING" =
    receipt.status === "confirmed" ? "CONFIRMED" : "PENDING";
  const travelerCreate = travelers.length
    ? {
        create: travelers,
      }
    : undefined;
  const travelerUpdate = travelers.length
    ? {
        deleteMany: {},
        create: travelers,
      }
    : {
        deleteMany: {},
      };
  const lastErrorMessage =
    receipt.amadeusFlightOrderError ??
    receipt.amadeusHotelBookingError ??
    undefined;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findUnique({
      where: { confirmationNumber: receipt.confirmationNumber },
      include: {
        retry: true,
      },
    });

    const baseData = {
      confirmationNumber: receipt.confirmationNumber,
      status: statusValue,
      itineraryId: receipt.itineraryId,
      itineraryHeadline: receipt.itineraryHeadline,
      chargedAmount: chargedAmountValue,
      chargedCurrency: resolvedCurrency,
      paymentIntentId: receipt.paymentIntentId,
      customerName: receipt.customerName,
      customerEmail: receipt.customerEmail,
      customerPhone: receipt.customerPhone,
      flightAirline: receipt.flight?.airline,
      flightNumber: receipt.flight?.flightNumber,
      flightDepartureAirport: receipt.flight?.departureAirport,
      flightArrivalAirport: receipt.flight?.arrivalAirport,
      flightDepartureTime: parseIsoDateTime(receipt.flight?.departureTime),
      flightArrivalTime: parseIsoDateTime(receipt.flight?.arrivalTime),
      stayName: receipt.stay?.name,
      stayLocation: receipt.stay?.location,
      stayCheckIn: parseIsoDate(receipt.stay?.checkIn),
      stayCheckOut: parseIsoDate(receipt.stay?.checkOut),
      amadeusFlightOrderId: receipt.amadeusFlightOrderId,
      amadeusHotelReservationId: receipt.amadeusHotelReservationId,
      amadeusFlightOrder: toJsonField(receipt.amadeusFlightOrder),
      amadeusHotelBooking: toJsonField(receipt.amadeusHotelBooking),
      amadeusFlightOrderError: receipt.amadeusFlightOrderError,
      amadeusHotelBookingError: receipt.amadeusHotelBookingError,
      requestPayload: toJsonField(payload),
    };

    const booking = existing
      ? await tx.booking.update({
          where: { id: existing.id },
          data: {
            ...baseData,
            travelers: travelerUpdate,
          },
        })
      : await tx.booking.create({
          data: {
            ...baseData,
            travelers: travelerCreate,
          },
        });

    if (!existing || existing.status !== booking.status) {
      await tx.bookingStatusEvent.create({
        data: {
          bookingId: booking.id,
          fromStatus: existing?.status,
          toStatus: booking.status,
          reason: lastErrorMessage,
        },
      });
    }

    if (booking.status === "PENDING") {
      const nextRunAt = new Date(Date.now() + 15 * 60 * 1000);
      await tx.bookingRetry.upsert({
        where: { bookingId: booking.id },
        update: {
          nextRunAt,
          lastError: lastErrorMessage,
        },
        create: {
          bookingId: booking.id,
          attempts: existing?.retry?.attempts ?? 0,
          nextRunAt,
          lastError: lastErrorMessage,
        },
      });
    } else if (existing?.retry) {
      await tx.bookingRetry.delete({
        where: { bookingId: existing.retry.bookingId },
      });
    }
  });
}
