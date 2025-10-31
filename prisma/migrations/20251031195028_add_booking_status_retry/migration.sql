-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "requestPayload" JSONB;

-- CreateTable
CREATE TABLE "BookingStatusEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRetry" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMPTZ(6) NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BookingRetry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingStatusEvent_bookingId_idx" ON "BookingStatusEvent"("bookingId");

-- CreateIndex
CREATE INDEX "BookingStatusEvent_createdAt_idx" ON "BookingStatusEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRetry_bookingId_key" ON "BookingRetry"("bookingId");

-- CreateIndex
CREATE INDEX "Booking_status_createdAt_idx" ON "Booking"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "BookingStatusEvent" ADD CONSTRAINT "BookingStatusEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRetry" ADD CONSTRAINT "BookingRetry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
