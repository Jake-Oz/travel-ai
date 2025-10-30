"use client";

// added comment to trigger change detection

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PaymentRequestButtonElement,
  useStripe,
} from "@stripe/react-stripe-js";
import type { PaymentRequest } from "@stripe/stripe-js";

import type { BookingResponse, ItineraryPackage } from "@/lib/types/travel";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

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
  const currency = (itinerary.totalPrice.currency ?? "AUD").toUpperCase();
  const stripeMode = (
    process.env.NEXT_PUBLIC_STRIPE_MODE ?? "test"
  ).toLowerCase();
  const isStripeTestMode = stripeMode === "test";
  const checkoutAmount = useMemo(
    () => (isStripeTestMode ? 1 : itinerary.totalPrice.amount),
    [isStripeTestMode, itinerary.totalPrice.amount]
  );

  const totalLabel = useMemo(
    () => itinerary.lodging.location || itinerary.headline,
    [itinerary.headline, itinerary.lodging.location]
  );

  const finalizeBooking = useCallback(async (): Promise<BookingResponse> => {
    const response = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itineraryId: itinerary.id }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Unable to finalize booking");
    }

    return (await response.json()) as BookingResponse;
  }, [itinerary.id]);

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
            amount: checkoutAmount,
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
          request.on("paymentmethod", async (event) => {
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

              const receipt = await finalizeBooking();
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
          });

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
    checkoutAmount,
    currency,
    finalizeBooking,
    itinerary.flight.airline,
    itinerary.id,
    itinerary.lodging.name,
    onError,
    onSuccess,
    stripe,
    totalLabel,
  ]);

  async function handleSandboxCheckout() {
    try {
      setPhase("processing");
      const receipt = await finalizeBooking();
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
                {formatCurrency(checkoutAmount, currency)}
              </p>
            </div>
            <p className="text-xs text-emerald-200">
              Apple Pay powered by Stripe
            </p>
          </div>
        </div>

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
