"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PaymentRequestButtonElement,
  useStripe,
} from "@stripe/react-stripe-js";
import type {
  PaymentIntent,
  PaymentRequest,
  PaymentRequestPaymentMethodEvent,
} from "@stripe/stripe-js";

import type {
  BookingResponse,
  BookingConfirmationPayload,
  ItineraryPackage,
} from "@/lib/types/travel";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

const zeroDecimalCurrencies = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

function toMajorUnits(amount: number, currency: string): number {
  const normalizedCurrency = currency.toUpperCase();
  const divisor = zeroDecimalCurrencies.has(normalizedCurrency) ? 1 : 100;
  if (divisor === 1) return amount;
  return Math.round((amount / divisor) * 100) / 100;
}

function splitFullName(fullName?: string | null): {
  firstName?: string;
  lastName?: string;
} {
  if (!fullName) return {};
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) {
    return { firstName: parts[0] };
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function derivePhoneComponents(phone?: string | null): {
  countryCode?: string;
  number?: string;
} {
  if (!phone) return {};
  const trimmed = phone.trim();
  if (!trimmed) return {};
  const digits = trimmed.replace(/[^0-9+]/g, "");
  if (!digits) return {};
  if (digits.startsWith("+")) {
    const withoutPlus = digits.slice(1);
    if (withoutPlus.length <= 3) {
      return { countryCode: withoutPlus || undefined };
    }
    if (withoutPlus.startsWith("1")) {
      const number = withoutPlus.slice(1);
      return {
        countryCode: "1",
        number: number || undefined,
      };
    }
    const countryCode = withoutPlus.slice(0, 2);
    const number = withoutPlus.slice(2);
    return {
      countryCode: countryCode || undefined,
      number: number || undefined,
    };
  }
  return {
    number: digits,
  };
}

interface BookingSheetProps {
  itinerary: ItineraryPackage;
  onClose: () => void;
  onSuccess: (receipt: BookingResponse) => void;
  onError: (message: string) => void;
}

type BookingPhase = "loading" | "ready" | "processing" | "completed" | "error";

export function BookingSheet({
  itinerary,
  onClose,
  onSuccess,
  onError,
}: BookingSheetProps) {
  const stripe = useStripe();
  const [phase, setPhase] = useState<BookingPhase>("loading");
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(
    null
  );
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | undefined>();
  const [intentAmount, setIntentAmount] = useState<number | undefined>();
  const [walletWarning, setWalletWarning] = useState<string | undefined>();
  const [travelerFirstName, setTravelerFirstName] = useState<string>("");
  const [travelerLastName, setTravelerLastName] = useState<string>("");
  const [travelerDateOfBirth, setTravelerDateOfBirth] = useState<string>("");
  const [travelerNationality, setTravelerNationality] = useState<string>("AU");
  const [travelerPassportNumber, setTravelerPassportNumber] =
    useState<string>("");
  const [travelerPassportExpiry, setTravelerPassportExpiry] =
    useState<string>("");
  const [travelerPassportIssuanceCountry, setTravelerPassportIssuanceCountry] =
    useState<string>("AU");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const applyPaymentContact = useCallback(
    ({
      name,
      email,
      phone,
    }: {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
    }) => {
      if (email && !customerEmail) {
        setCustomerEmail(email);
      }
      if (phone && !customerPhone) {
        setCustomerPhone(phone);
      }
      if (name) {
        const { firstName, lastName } = splitFullName(name);
        if (firstName && !travelerFirstName) {
          setTravelerFirstName(firstName);
        }
        if (lastName && !travelerLastName) {
          setTravelerLastName(lastName);
        }
      }
    },
    [customerEmail, customerPhone, travelerFirstName, travelerLastName]
  );
  const currency = (itinerary.totalPrice.currency ?? "AUD").toUpperCase();
  const stripeMode = (
    process.env.NEXT_PUBLIC_STRIPE_MODE ?? "test"
  ).toLowerCase();
  const isStripeTestMode = stripeMode === "test";

  const totalLabel = useMemo(
    () => itinerary.lodging.location || itinerary.headline,
    [itinerary.headline, itinerary.lodging.location]
  );

  const finalizeBooking = useCallback(
    async (payload: BookingConfirmationPayload): Promise<BookingResponse> => {
      const response = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          amount: payload.chargedAmount.amount,
          currency: payload.chargedAmount.currency,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Unable to finalize booking");
      }

      return (await response.json()) as BookingResponse;
    },
    []
  );

  const buildBookingPayload = useCallback(
    (
      overrides: Partial<BookingConfirmationPayload> = {}
    ): BookingConfirmationPayload => {
      const firstLeg = itinerary.flight.legs[0];
      const lastLeg = itinerary.flight.legs[itinerary.flight.legs.length - 1];
      const trimmedFirstName = travelerFirstName.trim();
      const trimmedLastName = travelerLastName.trim();
      const trimmedEmail = customerEmail.trim();
      const trimmedPhone = customerPhone.trim();
      const composedPhone = trimmedPhone;
      const phoneComponents = derivePhoneComponents(composedPhone);

      const travelers =
        trimmedFirstName && trimmedLastName
          ? [
              {
                firstName: trimmedFirstName,
                lastName: trimmedLastName,
                dateOfBirth: travelerDateOfBirth || undefined,
                email: trimmedEmail || undefined,
                phoneCountryCode: phoneComponents.countryCode,
                phoneNumber: phoneComponents.number,
                nationality: travelerNationality.trim() || undefined,
                passportNumber: travelerPassportNumber.trim() || undefined,
                passportExpiry: travelerPassportExpiry || undefined,
                passportIssuanceCountry:
                  travelerPassportIssuanceCountry.trim() || undefined,
              },
            ]
          : undefined;

      return {
        itineraryId: itinerary.id,
        itineraryHeadline: itinerary.headline,
        chargedAmount: {
          amount: itinerary.totalPrice.amount,
          currency,
        },
        customerEmail: trimmedEmail || undefined,
        customerName:
          trimmedFirstName && trimmedLastName
            ? `${trimmedFirstName} ${trimmedLastName}`
            : overrides.customerName,
        customerPhone: composedPhone || undefined,
        travelers,
        amadeusFlightOffer: itinerary.flight.amadeus?.raw,
        amadeusHotelOffer: itinerary.lodging.amadeus
          ? {
              offerId: itinerary.lodging.amadeus.offerId,
              hotelId: itinerary.lodging.amadeus.hotelId,
              raw: itinerary.lodging.amadeus.raw,
            }
          : undefined,
        flight: {
          airline: itinerary.flight.airline,
          flightNumber: itinerary.flight.flightNumber,
          departureAirport: firstLeg?.departureAirport,
          arrivalAirport: lastLeg?.arrivalAirport,
          departureTime: firstLeg?.departureTime,
          arrivalTime: lastLeg?.arrivalTime,
        },
        stay: {
          name: itinerary.lodging.name,
          location: itinerary.lodging.location,
          checkIn: itinerary.lodging.checkIn,
          checkOut: itinerary.lodging.checkOut,
        },
        ...overrides,
      };
    },
    [
      currency,
      customerEmail,
      customerPhone,
      itinerary,
      travelerDateOfBirth,
      travelerFirstName,
      travelerLastName,
      travelerNationality,
      travelerPassportExpiry,
      travelerPassportIssuanceCountry,
      travelerPassportNumber,
    ]
  );

  const handleFinalize = useCallback(
    (
      overrides: Partial<BookingConfirmationPayload> = {},
      intent?: PaymentIntent | null
    ) => {
      const basePayload = buildBookingPayload();

      let chargedAmount = overrides.chargedAmount ?? basePayload.chargedAmount;
      if (intent?.amount && intent.currency) {
        chargedAmount = {
          amount: toMajorUnits(intent.amount, intent.currency),
          currency: intent.currency.toUpperCase(),
        };
      }

      const mergedPayload: BookingConfirmationPayload = {
        ...basePayload,
        ...overrides,
        chargedAmount,
      };

      if (!mergedPayload.customerPhone && basePayload.customerPhone) {
        mergedPayload.customerPhone = basePayload.customerPhone;
      }

      if (
        (!mergedPayload.travelers || mergedPayload.travelers.length === 0) &&
        mergedPayload.customerName
      ) {
        const { firstName, lastName } = splitFullName(
          mergedPayload.customerName
        );
        const phoneComponents = derivePhoneComponents(
          mergedPayload.customerPhone
        );
        if (firstName && lastName) {
          mergedPayload.travelers = [
            {
              firstName,
              lastName,
              email: mergedPayload.customerEmail,
              phoneCountryCode: phoneComponents.countryCode,
              phoneNumber: phoneComponents.number,
            },
          ];
        }
      }

      return finalizeBooking(mergedPayload);
    },
    [buildBookingPayload, finalizeBooking]
  );

  const resolvePaymentIntentId = (
    intent?: PaymentIntent | null,
    fallback?: PaymentIntent | null
  ): string | undefined => intent?.id ?? fallback?.id;

  const resolveCustomerEmail = (
    event: PaymentRequestPaymentMethodEvent,
    intent?: PaymentIntent | null
  ): string | undefined =>
    event.payerEmail ?? intent?.receipt_email ?? undefined;

  const resolveCustomerName = (
    event: PaymentRequestPaymentMethodEvent,
    intent?: PaymentIntent | null
  ): string | undefined =>
    event.payerName ?? intent?.shipping?.name ?? undefined;

  const resolveCustomerPhone = (
    event: PaymentRequestPaymentMethodEvent,
    intent?: PaymentIntent | null
  ): string | undefined =>
    event.payerPhone ?? intent?.shipping?.phone ?? undefined;

  useEffect(() => {
    let isMounted = true;

    async function setupPaymentIntent() {
      if (!stripe) {
        setPhase("ready");
        setPaymentRequest(null);
        setClientSecret(null);
        setIntentAmount(undefined);
        return;
      }

      setPhase("loading");
      setPaymentError(undefined);
      setWalletWarning(undefined);

      try {
        const response = await fetch("/api/payments/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itineraryId: itinerary.id,
            amount: itinerary.totalPrice.amount,
            currency,
            description: `${itinerary.flight.airline} + ${itinerary.lodging.name}`,
          }),
        });

        if (!response.ok) {
          if (response.status === 503) {
            // Stripe is not configured; fall back to sandbox checkout without surfacing an error.
            if (isMounted) {
              setPaymentRequest(null);
              setClientSecret(null);
              setIntentAmount(undefined);
              setPhase("ready");
            }
            return;
          }
          const text = await response.text();
          throw new Error(text || "Unable to initialize payment session");
        }

        const payload = (await response.json()) as {
          clientSecret?: string;
          amount: number;
          currency: string;
          country: string;
        };

        if (!payload.clientSecret) {
          throw new Error("Payment client secret missing");
        }

        if (!isMounted) return;

        const secret = payload.clientSecret;
        setClientSecret(secret);
        setIntentAmount(payload.amount);

        const request = stripe.paymentRequest({
          country: payload.country,
          currency: payload.currency.toLowerCase(),
          total: {
            label: `Travel-AI · ${totalLabel}`,
            amount: payload.amount,
          },
          requestPayerEmail: true,
          requestPayerName: true,
          requestPayerPhone: true,
          disableWallets: ["googlePay"],
        });

        const result = await request.canMakePayment();
        if (!isMounted) return;

        console.info("Stripe PaymentRequest capabilities", result);

        if (result?.applePay) {
          request.on(
            "paymentmethod",
            async (event: PaymentRequestPaymentMethodEvent) => {
              if (!secret) {
                event.complete("fail");
                setPaymentError("Payment session unavailable. Please retry.");
                setPhase("error");
                return;
              }

              setPhase("processing");
              setPaymentError(undefined);

              let isCompletedSuccessfully = false;

              try {
                const confirmation = await stripe.confirmCardPayment(
                  secret,
                  {
                    payment_method: event.paymentMethod.id,
                  },
                  { handleActions: false }
                );

                if (confirmation.error) {
                  console.error(
                    "Apple Pay confirmation error",
                    confirmation.error
                  );
                  throw confirmation.error;
                }

                event.complete("success");
                isCompletedSuccessfully = true;

                const finalResult = await stripe.confirmCardPayment(secret);
                if (finalResult.error) {
                  console.error(
                    "Apple Pay authentication error",
                    finalResult.error
                  );
                  throw finalResult.error;
                }

                const paymentIntent =
                  finalResult.paymentIntent ?? confirmation.paymentIntent;
                const resolvedIntent =
                  paymentIntent ?? confirmation.paymentIntent ?? null;
                const resolvedEmail = resolveCustomerEmail(
                  event,
                  resolvedIntent
                );
                const resolvedName = resolveCustomerName(event, resolvedIntent);
                const resolvedPhone = resolveCustomerPhone(
                  event,
                  resolvedIntent
                );

                applyPaymentContact({
                  name: resolvedName,
                  email: resolvedEmail,
                  phone: resolvedPhone,
                });

                const receipt = await handleFinalize(
                  {
                    paymentIntentId: resolvePaymentIntentId(
                      paymentIntent,
                      confirmation.paymentIntent
                    ),
                    customerEmail: resolvedEmail,
                    customerName: resolvedName,
                    customerPhone: resolvedPhone,
                  },
                  resolvedIntent
                );
                setPhase("completed");
                onSuccess(receipt);
              } catch (error) {
                console.error("Apple Pay flow failed", error);
                const message =
                  error instanceof Error
                    ? error.message
                    : "Apple Pay authorization failed";
                setPaymentError(message);
                setPhase("error");
                if (!isCompletedSuccessfully) {
                  event.complete("fail");
                }
                onError(message);
              }
            }
          );

          setPaymentRequest(request);
          setWalletWarning(undefined);
        } else {
          setPaymentRequest(null);
          setWalletWarning(
            "Apple Pay is unavailable. Use Safari on a device with Apple Pay enabled and register your domain in Stripe’s Payment Method Domains settings."
          );
        }

        setPhase("ready");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to initialize payment session";
        if (!isMounted) return;
        setPaymentError(message);
        setPhase("error");
        onError(message);
      }
    }

    setupPaymentIntent();

    return () => {
      isMounted = false;
      setPaymentRequest(null);
      setClientSecret(null);
    };
  }, [
    currency,
    handleFinalize,
    applyPaymentContact,
    itinerary.flight.airline,
    itinerary.id,
    itinerary.lodging.name,
    itinerary.totalPrice.amount,
    onError,
    onSuccess,
    stripe,
    totalLabel,
  ]);

  async function handleSandboxCheckout() {
    try {
      setPhase("processing");
      const receipt = await handleFinalize(
        {
          paymentIntentId: "sandbox-manual",
        },
        null
      );
      setPhase("completed");
      onSuccess(receipt);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to complete sandbox checkout";
      setPaymentError(message);
      setPhase("error");
      onError(message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8">
      <div className="w-full max-w-xl rounded-3xl border border-slate-800/60 bg-slate-950 p-6 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Confirm itinerary
            </p>
            <h2 className="text-2xl font-semibold text-slate-100">
              {itinerary.headline}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            Close
          </button>
        </header>

        <div className="mt-6 space-y-4 text-sm text-slate-300">
          <section className="rounded-2xl border border-slate-800/40 bg-slate-900/50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Flight
            </h3>
            <p className="mt-1 font-semibold text-slate-100">
              {itinerary.flight.airline} {itinerary.flight.flightNumber}
            </p>
            <p className="text-xs text-slate-500">
              {formatDateTime(itinerary.flight.legs[0]?.departureTime)} →{" "}
              {formatDateTime(
                itinerary.flight.legs[itinerary.flight.legs.length - 1]
                  ?.arrivalTime
              )}
            </p>
          </section>

          <section className="rounded-2xl border border-slate-800/40 bg-slate-900/50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Stay
            </h3>
            <p className="mt-1 font-semibold text-slate-100">
              {itinerary.lodging.name}
            </p>
            <p className="text-xs text-slate-500">
              {itinerary.lodging.location}
            </p>
            <p className="text-xs text-slate-500">
              Check-in {itinerary.lodging.checkIn} · Check-out{" "}
              {itinerary.lodging.checkOut}
            </p>
          </section>

          <div className="flex items-center justify-between rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-300">
                Total
              </p>
              <p className="text-lg font-semibold text-emerald-100">
                {formatCurrency(itinerary.totalPrice.amount, currency)}
              </p>
            </div>
            <p className="text-xs text-emerald-200">
              Apple Pay powered by Stripe
            </p>
          </div>
        </div>

        <section className="mt-6 space-y-4 rounded-2xl border border-slate-800/40 bg-slate-900/50 p-4 text-sm text-slate-300">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Lead traveller contact
              </h3>
              <p className="mt-1 text-[11px] text-slate-500">
                Required for Amadeus ticketing. Sandbox accepts placeholder
                documents if you don&apos;t have real details yet.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                First name
              </span>
              <input
                type="text"
                value={travelerFirstName}
                onChange={(event) => setTravelerFirstName(event.target.value)}
                placeholder="Alex"
                className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Last name
              </span>
              <input
                type="text"
                value={travelerLastName}
                onChange={(event) => setTravelerLastName(event.target.value)}
                placeholder="Walker"
                className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Date of birth
              </span>
              <input
                type="date"
                value={travelerDateOfBirth}
                onChange={(event) => setTravelerDateOfBirth(event.target.value)}
                className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Nationality (ISO code)
              </span>
              <input
                type="text"
                inputMode="text"
                maxLength={2}
                value={travelerNationality}
                onChange={(event) =>
                  setTravelerNationality(event.target.value.toUpperCase())
                }
                className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-slate-100 uppercase outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Passport number
              </span>
              <input
                type="text"
                value={travelerPassportNumber}
                onChange={(event) =>
                  setTravelerPassportNumber(event.target.value.toUpperCase())
                }
                placeholder="PA1234567"
                className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-slate-100 uppercase outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Passport expiry
              </span>
              <input
                type="date"
                value={travelerPassportExpiry}
                onChange={(event) =>
                  setTravelerPassportExpiry(event.target.value)
                }
                className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Passport issuance country (ISO)
              </span>
              <input
                type="text"
                maxLength={2}
                value={travelerPassportIssuanceCountry}
                onChange={(event) =>
                  setTravelerPassportIssuanceCountry(
                    event.target.value.toUpperCase()
                  )
                }
                className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-slate-100 uppercase outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Contact email
              </span>
              <input
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="alex@example.com"
                className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
          </div>

          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">
              Contact phone (E.164)
            </span>
            <input
              type="tel"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              placeholder="+61412345678"
              className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
            />
          </label>
        </section>

        <div className="mt-6 space-y-3">
          {phase === "loading" && (
            <div className="rounded-2xl border border-slate-800/40 bg-slate-900/50 p-4 text-sm text-slate-400">
              Initializing secure payment session…
            </div>
          )}

          {paymentRequest && clientSecret && (
            <PaymentRequestButtonElement
              options={{
                paymentRequest,
                style: {
                  paymentRequestButton: {
                    theme: "dark",
                    height: "48px",
                    type: "buy",
                  },
                },
              }}
              className="w-full overflow-hidden rounded-2xl"
            />
          )}

          {(!paymentRequest || !intentAmount) && (
            <button
              type="button"
              onClick={handleSandboxCheckout}
              disabled={phase === "processing"}
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Complete booking (sandbox)
            </button>
          )}

          {paymentError && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-900/40 p-4 text-xs text-rose-100">
              {paymentError}
            </div>
          )}

          {walletWarning && (
            <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-xs text-amber-200">
              {walletWarning}
            </div>
          )}

          <p className="text-[11px] text-slate-500">
            Apple Pay availability depends on your device and browser. Sandbox
            checkout will simulate a confirmed reservation without charging a
            card.
          </p>

          {isStripeTestMode && (
            <p className="text-[11px] text-emerald-500">
              Stripe test mode: Apple Pay authorisations succeed with your real
              wallet card but the transaction is recorded as a test payment
              only, so no funds are captured.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
