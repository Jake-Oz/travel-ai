import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const defaultCurrency = (process.env.PAYMENTS_DEFAULT_CURRENCY ?? "AUD").toUpperCase();
const defaultCountry = (process.env.PAYMENTS_DEFAULT_COUNTRY ?? "AU").toUpperCase();

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

const currencyCountryMap: Record<string, string> = {
  USD: "US",
  EUR: "FR",
  GBP: "GB",
  AUD: "AU",
  CAD: "CA",
  NZD: "NZ",
  JPY: "JP",
  SGD: "SG",
};

function normalizeCurrency(currency?: string | null): string {
  return (currency ?? defaultCurrency).toUpperCase();
}

function toMinorUnits(amount: number, currency: string): number {
  if (Number.isNaN(amount) || amount <= 0) {
    throw new Error("Invalid amount");
  }

  const normalizedCurrency = currency.toUpperCase();
  const multiplier = zeroDecimalCurrencies.has(normalizedCurrency) ? 1 : 100;
  return Math.round(amount * multiplier);
}

function detectCountryFromCurrency(currency: string): string {
  const normalizedCurrency = currency.toUpperCase();
  if (currencyCountryMap[normalizedCurrency]) {
    return currencyCountryMap[normalizedCurrency];
  }

  if (normalizedCurrency === defaultCurrency) {
    return defaultCountry;
  }

  return defaultCountry;
}

export async function POST(request: Request) {
  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 },
    );
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const body = (await request.json()) as {
      itineraryId?: string;
      amount?: number;
      currency?: string;
      description?: string;
    };

    if (!body?.itineraryId || !body.amount) {
      return NextResponse.json(
        { error: "Missing itineraryId or amount" },
        { status: 400 },
      );
    }

    const normalizedCurrency = normalizeCurrency(body.currency);
    const amount = toMinorUnits(body.amount, normalizedCurrency);

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: normalizedCurrency.toLowerCase(),
      description: body.description || `Travel-AI itinerary ${body.itineraryId}`,
      automatic_payment_methods: { enabled: true },
      metadata: {
        itineraryId: body.itineraryId,
        currency: normalizedCurrency,
      },
    });

    return NextResponse.json({
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount,
      currency: normalizedCurrency,
      country: detectCountryFromCurrency(normalizedCurrency),
    });
  } catch (error) {
    console.error("Stripe intent creation failed", error);
    return NextResponse.json(
      { error: "Unable to create payment intent" },
      { status: 500 },
    );
  }
}
