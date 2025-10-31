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

const VALIDATION_ERROR_MESSAGE =
  "Complete the highlighted traveller and contact details before continuing.";

function toMajorUnits(amount: number, currency: string): number {
  const normalizedCurrency = currency.toUpperCase();
  const divisor = zeroDecimalCurrencies.has(normalizedCurrency) ? 1 : 100;
  if (divisor === 1) return amount;
  return Math.round((amount / divisor) * 100) / 100;
}

function parseISODate(value: string): Date | null {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function isBeforeToday(date: Date): boolean {
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return date.getTime() < todayUTC;
}

function isAfterToday(date: Date): boolean {
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return date.getTime() > todayUTC;
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

const INPUT_BASE_CLASS =
  "w-full rounded-xl border bg-slate-950/60 px-3 py-2 text-slate-100 outline-none transition focus:ring-2 focus:ring-emerald-500/40";

function inputClassName(
  error?: string,
  filled?: boolean,
  extra?: string
): string {
  const borderClass = error
    ? "border-rose-500/60 focus:border-rose-400"
    : filled
    ? "border-emerald-500/60 focus:border-emerald-400"
    : "border-slate-800/60 focus:border-emerald-400";
  return `${INPUT_BASE_CLASS} ${borderClass}${extra ? ` ${extra}` : ""}`;
}

interface BookingSheetProps {
  itinerary: ItineraryPackage;
  onClose: () => void;
  onSuccess: (receipt: BookingResponse) => void;
  onError: (message: string) => void;
}

type BookingPhase = "loading" | "ready" | "processing" | "completed" | "error";

type ValidationErrors = {
  travelerFirstName?: string;
  travelerLastName?: string;
  travelerDateOfBirth?: string;
  travelerNationality?: string;
  travelerPassportNumber?: string;
  travelerPassportExpiry?: string;
  travelerPassportIssuanceCountry?: string;
  customerEmail?: string;
  customerPhone?: string;
};

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
  const [showValidationErrors, setShowValidationErrors] = useState(false);
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

  const validationErrors = useMemo<ValidationErrors>(() => {
    const errors: ValidationErrors = {};

    const firstName = travelerFirstName.trim();
    if (!firstName) {
      errors.travelerFirstName = "First name is required.";
    }

    const lastName = travelerLastName.trim();
    if (!lastName) {
      errors.travelerLastName = "Last name is required.";
    }

    const dobRaw = travelerDateOfBirth.trim();
    if (!dobRaw) {
      errors.travelerDateOfBirth = "Date of birth is required.";
    } else {
      const parsed = parseISODate(dobRaw);
      if (!parsed) {
        errors.travelerDateOfBirth = "Use the format YYYY-MM-DD.";
      } else if (!isBeforeToday(parsed)) {
        errors.travelerDateOfBirth = "Date of birth must be in the past.";
      }
    }

    const nationality = travelerNationality.trim();
    if (!/^[A-Z]{2}$/.test(nationality)) {
      errors.travelerNationality = "Use a 2-letter ISO country code.";
    }

    const passportNumber = travelerPassportNumber.trim();
    if (!passportNumber) {
      errors.travelerPassportNumber = "Passport number is required.";
    } else if (passportNumber.length < 5) {
      errors.travelerPassportNumber = "Passport number looks too short.";
    }

    const passportExpiryRaw = travelerPassportExpiry.trim();
    if (!passportExpiryRaw) {
      errors.travelerPassportExpiry = "Passport expiry is required.";
    } else {
      const parsed = parseISODate(passportExpiryRaw);
      if (!parsed) {
        errors.travelerPassportExpiry = "Use the format YYYY-MM-DD.";
      } else if (!isAfterToday(parsed)) {
        errors.travelerPassportExpiry =
          "Passport must be valid for future travel.";
      }
    }

    const issuance = travelerPassportIssuanceCountry.trim();
    if (!/^[A-Z]{2}$/.test(issuance)) {
      errors.travelerPassportIssuanceCountry =
        "Use a 2-letter ISO country code.";
    }

    const email = customerEmail.trim();
    if (!email) {
      errors.customerEmail = "Contact email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.customerEmail = "Enter a valid email address.";
    }

    const phone = customerPhone.trim();
    if (!phone) {
      errors.customerPhone = "Contact phone is required.";
    } else if (!/^\+[1-9][0-9]{6,14}$/.test(phone)) {
      errors.customerPhone = "Use international format like +61412345678.";
    } else {
      const components = derivePhoneComponents(phone);
      if (!components.countryCode || !components.number) {
        errors.customerPhone = "Unable to read that phone number.";
      }
    }

    return errors;
  }, [
    customerEmail,
    customerPhone,
    travelerDateOfBirth,
    travelerFirstName,
    travelerLastName,
    travelerNationality,
    travelerPassportExpiry,
    travelerPassportIssuanceCountry,
    travelerPassportNumber,
  ]);

  const hasValidationErrors = useMemo(
    () => Object.values(validationErrors).some(Boolean),
    [validationErrors]
  );

  const firstNameError =
    showValidationErrors || travelerFirstName.trim().length > 0
      ? validationErrors.travelerFirstName
      : undefined;
  const lastNameError =
    showValidationErrors || travelerLastName.trim().length > 0
      ? validationErrors.travelerLastName
      : undefined;
  const dateOfBirthError =
    showValidationErrors || travelerDateOfBirth.trim().length > 0
      ? validationErrors.travelerDateOfBirth
      : undefined;
  const nationalityError =
    showValidationErrors || travelerNationality.trim().length > 0
      ? validationErrors.travelerNationality
      : undefined;
  const passportNumberError =
    showValidationErrors || travelerPassportNumber.trim().length > 0
      ? validationErrors.travelerPassportNumber
      : undefined;
  const passportExpiryError =
    showValidationErrors || travelerPassportExpiry.trim().length > 0
      ? validationErrors.travelerPassportExpiry
      : undefined;
  const passportIssuanceError =
    showValidationErrors || travelerPassportIssuanceCountry.trim().length > 0
      ? validationErrors.travelerPassportIssuanceCountry
      : undefined;
  const emailError =
    showValidationErrors || customerEmail.trim().length > 0
      ? validationErrors.customerEmail
      : undefined;
  const phoneError =
    showValidationErrors || customerPhone.trim().length > 0
      ? validationErrors.customerPhone
      : undefined;

  const firstNameFilled = travelerFirstName.trim().length > 0;
  const lastNameFilled = travelerLastName.trim().length > 0;
  const dateOfBirthFilled = travelerDateOfBirth.trim().length > 0;
  const nationalityFilled = travelerNationality.trim().length > 0;
  const passportNumberFilled = travelerPassportNumber.trim().length > 0;
  const passportExpiryFilled = travelerPassportExpiry.trim().length > 0;
  const passportIssuanceFilled =
    travelerPassportIssuanceCountry.trim().length > 0;
  const emailFilled = customerEmail.trim().length > 0;
  const phoneFilled = customerPhone.trim().length > 0;
  const isProcessingCheckout = phase === "processing";

  const travelerFullName = [travelerFirstName.trim(), travelerLastName.trim()]
    .filter(Boolean)
    .join(" ");
  const summaryNationality = travelerNationality.trim().toUpperCase() || "";
  const summaryPassportCountry =
    travelerPassportIssuanceCountry.trim().toUpperCase() || "";
  const showSummaryCard =
    Boolean(travelerFullName) ||
    dateOfBirthFilled ||
    nationalityFilled ||
    passportNumberFilled ||
    passportExpiryFilled ||
    emailFilled ||
    phoneFilled;

  useEffect(() => {
    if (!showValidationErrors) return;
    if (!hasValidationErrors && paymentError === VALIDATION_ERROR_MESSAGE) {
      setPaymentError(undefined);
    }
  }, [hasValidationErrors, paymentError, showValidationErrors]);

  const ensureFormIsValid = useCallback(() => {
    setShowValidationErrors(true);
    if (hasValidationErrors) {
      setPhase("ready");
      setPaymentError(VALIDATION_ERROR_MESSAGE);
      return false;
    }
    return true;
  }, [hasValidationErrors]);

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

              if (!ensureFormIsValid()) {
                event.complete("fail");
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

                const receipt: BookingResponse = await handleFinalize(
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
    ensureFormIsValid,
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
    if (!ensureFormIsValid()) {
      return;
    }
    try {
      setPhase("processing");
      const receipt: BookingResponse = await handleFinalize(
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80">
      <div className="flex min-h-full items-start justify-center px-4 py-8 sm:items-center">
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
                  aria-invalid={Boolean(firstNameError)}
                  className={inputClassName(firstNameError, firstNameFilled)}
                />
                {firstNameError && (
                  <p className="text-[11px] text-rose-300">{firstNameError}</p>
                )}
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
                  aria-invalid={Boolean(lastNameError)}
                  className={inputClassName(lastNameError, lastNameFilled)}
                />
                {lastNameError && (
                  <p className="text-[11px] text-rose-300">{lastNameError}</p>
                )}
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
                  onChange={(event) =>
                    setTravelerDateOfBirth(event.target.value)
                  }
                  aria-invalid={Boolean(dateOfBirthError)}
                  className={inputClassName(
                    dateOfBirthError,
                    dateOfBirthFilled
                  )}
                />
                {dateOfBirthError && (
                  <p className="text-[11px] text-rose-300">
                    {dateOfBirthError}
                  </p>
                )}
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
                  aria-invalid={Boolean(nationalityError)}
                  className={inputClassName(
                    nationalityError,
                    nationalityFilled,
                    "uppercase"
                  )}
                />
                {nationalityError && (
                  <p className="text-[11px] text-rose-300">
                    {nationalityError}
                  </p>
                )}
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
                  aria-invalid={Boolean(passportNumberError)}
                  className={inputClassName(
                    passportNumberError,
                    passportNumberFilled,
                    "uppercase"
                  )}
                />
                {passportNumberError && (
                  <p className="text-[11px] text-rose-300">
                    {passportNumberError}
                  </p>
                )}
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
                  aria-invalid={Boolean(passportExpiryError)}
                  className={inputClassName(
                    passportExpiryError,
                    passportExpiryFilled
                  )}
                />
                {passportExpiryError && (
                  <p className="text-[11px] text-rose-300">
                    {passportExpiryError}
                  </p>
                )}
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
                  aria-invalid={Boolean(passportIssuanceError)}
                  className={inputClassName(
                    passportIssuanceError,
                    passportIssuanceFilled,
                    "uppercase"
                  )}
                />
                {passportIssuanceError && (
                  <p className="text-[11px] text-rose-300">
                    {passportIssuanceError}
                  </p>
                )}
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
                  aria-invalid={Boolean(emailError)}
                  className={inputClassName(emailError, emailFilled)}
                />
                {emailError && (
                  <p className="text-[11px] text-rose-300">{emailError}</p>
                )}
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
                aria-invalid={Boolean(phoneError)}
                className={inputClassName(phoneError, phoneFilled)}
              />
              {phoneError && (
                <p className="text-[11px] text-rose-300">{phoneError}</p>
              )}
            </label>
          </section>

          {showSummaryCard && (
            <section className="mt-6 rounded-2xl border border-emerald-400/20 bg-slate-900/60 p-4 text-xs">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                Review before checkout
              </h3>
              <dl className="mt-3 grid gap-3 text-slate-400 sm:grid-cols-2">
                <div className="space-y-1 rounded-xl border border-slate-800/40 bg-slate-950/60 p-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide">
                    Lead traveller
                  </dt>
                  <dd className="text-sm text-slate-100">
                    {travelerFullName ? (
                      travelerFullName
                    ) : (
                      <span className="text-amber-300">
                        Add first and last name
                      </span>
                    )}
                  </dd>
                  <p className="text-[11px]">
                    {summaryNationality ? (
                      <>Nationality · {summaryNationality}</>
                    ) : (
                      <span className="text-amber-300">
                        Nationality missing
                      </span>
                    )}
                  </p>
                </div>

                <div className="space-y-1 rounded-xl border border-slate-800/40 bg-slate-950/60 p-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide">
                    Date of birth
                  </dt>
                  <dd className="text-sm text-slate-100">
                    {dateOfBirthFilled ? (
                      travelerDateOfBirth
                    ) : (
                      <span className="text-amber-300">Add date of birth</span>
                    )}
                  </dd>
                </div>

                <div className="space-y-1 rounded-xl border border-slate-800/40 bg-slate-950/60 p-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide">
                    Passport
                  </dt>
                  <dd className="text-sm text-slate-100">
                    {passportNumberFilled ? (
                      travelerPassportNumber
                    ) : (
                      <span className="text-amber-300">
                        Add passport number
                      </span>
                    )}
                  </dd>
                  <p className="text-[11px]">
                    {passportExpiryFilled ? (
                      <>Expiry · {travelerPassportExpiry}</>
                    ) : (
                      <span className="text-amber-300">
                        Expiry date missing
                      </span>
                    )}
                  </p>
                  <p className="text-[11px]">
                    {summaryPassportCountry ? (
                      <>Issued · {summaryPassportCountry}</>
                    ) : (
                      <span className="text-amber-300">
                        Issuance country missing
                      </span>
                    )}
                  </p>
                </div>

                <div className="space-y-1 rounded-xl border border-slate-800/40 bg-slate-950/60 p-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide">
                    Contact
                  </dt>
                  <dd className="text-sm text-slate-100">
                    {emailFilled ? (
                      customerEmail
                    ) : (
                      <span className="text-amber-300">Add contact email</span>
                    )}
                  </dd>
                  <p className="text-[11px]">
                    {phoneFilled ? (
                      customerPhone
                    ) : (
                      <span className="text-amber-300">
                        Contact phone missing
                      </span>
                    )}
                  </p>
                </div>
              </dl>
            </section>
          )}

          <div className="mt-6 space-y-3">
            {showValidationErrors && hasValidationErrors && (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-900/40 p-4 text-xs text-rose-100">
                {VALIDATION_ERROR_MESSAGE}
              </div>
            )}

            {phase === "loading" && (
              <div className="rounded-2xl border border-slate-800/40 bg-slate-900/50 p-4 text-sm text-slate-400">
                Initializing secure payment session…
              </div>
            )}

            {paymentRequest && clientSecret && (
              <div className="relative">
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
                {isProcessingCheckout && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/70">
                    <span className="flex items-center gap-2 text-sm text-emerald-200">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
                      Authorising with Apple Pay…
                    </span>
                  </div>
                )}
              </div>
            )}

            {(!paymentRequest || !intentAmount) && (
              <button
                type="button"
                onClick={handleSandboxCheckout}
                disabled={isProcessingCheckout}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isProcessingCheckout ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
                    Processing…
                  </span>
                ) : (
                  "Complete booking (sandbox)"
                )}
              </button>
            )}

            {paymentError && paymentError !== VALIDATION_ERROR_MESSAGE && (
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
                Stripe test mode: Apple Pay authorisations succeed with your
                real wallet card but the transaction is recorded as a test
                payment only, so no funds are captured.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
