-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'PENDING');

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "confirmationNumber" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "itineraryId" TEXT NOT NULL,
    "itineraryHeadline" TEXT NOT NULL,
    "chargedAmount" DECIMAL(12,2) NOT NULL,
    "chargedCurrency" VARCHAR(3) NOT NULL,
    "paymentIntentId" VARCHAR(191),
    "customerName" VARCHAR(191),
    "customerEmail" VARCHAR(191),
    "customerPhone" VARCHAR(64),
    "flightAirline" VARCHAR(191),
    "flightNumber" VARCHAR(64),
    "flightDepartureAirport" VARCHAR(64),
    "flightArrivalAirport" VARCHAR(64),
    "flightDepartureTime" TIMESTAMPTZ(6),
    "flightArrivalTime" TIMESTAMPTZ(6),
    "stayName" VARCHAR(191),
    "stayLocation" VARCHAR(191),
    "stayCheckIn" DATE,
    "stayCheckOut" DATE,
    "amadeusFlightOrderId" VARCHAR(191),
    "amadeusHotelReservationId" VARCHAR(191),
    "amadeusFlightOrder" JSONB,
    "amadeusHotelBooking" JSONB,
    "amadeusFlightOrderError" TEXT,
    "amadeusHotelBookingError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Traveler" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "firstName" VARCHAR(191) NOT NULL,
    "lastName" VARCHAR(191) NOT NULL,
    "dateOfBirth" DATE,
    "email" VARCHAR(191),
    "phoneCountryCode" VARCHAR(8),
    "phoneNumber" VARCHAR(32),
    "nationality" VARCHAR(2),
    "passportNumber" VARCHAR(64),
    "passportExpiry" DATE,
    "passportIssuanceCountry" VARCHAR(2),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Traveler_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_confirmationNumber_key" ON "Booking"("confirmationNumber");

-- CreateIndex
CREATE INDEX "Booking_itineraryId_idx" ON "Booking"("itineraryId");

-- CreateIndex
CREATE INDEX "Booking_paymentIntentId_idx" ON "Booking"("paymentIntentId");

-- CreateIndex
CREATE INDEX "Traveler_bookingId_idx" ON "Traveler"("bookingId");

-- AddForeignKey
ALTER TABLE "Traveler" ADD CONSTRAINT "Traveler_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
