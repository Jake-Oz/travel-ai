import type { BookingResponse, BookingTraveler } from "@/lib/types/travel";

const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom =
  process.env.RESEND_FROM_EMAIL ?? "notifications@travel-ai.dev";

interface BookingEmailPayload {
  receipt: BookingResponse;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
  }).format(amount);
}

function formatMoneyValue(value?: {
  amount: number;
  currency: string;
}): string | undefined {
  if (!value) return undefined;
  return formatCurrency(value.amount, value.currency);
}

function safeDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

function formatDateTime(value?: string): string | undefined {
  const parsed = safeDate(value);
  if (!parsed) return value;

  try {
    return new Intl.DateTimeFormat("en-AU", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(parsed);
  } catch (error) {
    console.warn("Failed to format date for confirmation email", {
      value,
      error,
    });
    return value;
  }
}

function buildTravelerSummary(travelers?: BookingTraveler[]): {
  text: string[];
  html: string;
} | null {
  if (!travelers?.length) {
    return null;
  }

  const textLines = travelers.map((traveler, index) => {
    const name =
      [traveler.firstName, traveler.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || `Traveller ${index + 1}`;

    const descriptors: string[] = [];
    if (traveler.travelerType) {
      descriptors.push(traveler.travelerType);
    }
    if (traveler.dateOfBirth) {
      descriptors.push(`DOB ${traveler.dateOfBirth}`);
    }
    if (traveler.nationality) {
      descriptors.push(`Nationality ${traveler.nationality}`);
    }

    return descriptors.length
      ? `• ${name} (${descriptors.join(", ")})`
      : `• ${name}`;
  });

  const htmlItems = travelers
    .map((traveler, index) => {
      const name =
        [traveler.firstName, traveler.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || `Traveller ${index + 1}`;

      const meta: string[] = [];
      if (traveler.travelerType) {
        meta.push(traveler.travelerType);
      }
      if (traveler.dateOfBirth) {
        meta.push(`DOB ${traveler.dateOfBirth}`);
      }
      if (traveler.nationality) {
        meta.push(`Nationality ${traveler.nationality}`);
      }

      const description = meta.length
        ? `<div style="font-size: 12px; color: rgba(148, 163, 184, 0.8);">${meta.join(
            " · "
          )}</div>`
        : "";

      return `<li style="margin: 6px 0;">${name}${description}</li>`;
    })
    .join("");

  return {
    text: textLines,
    html: `<ul style="margin: 12px 0; padding-left: 18px; color: #f8fafc;">${htmlItems}</ul>`,
  };
}

export async function sendBookingConfirmationEmail({
  receipt,
}: BookingEmailPayload): Promise<void> {
  if (!resendApiKey) {
    console.info(
      "Skipping booking confirmation email: RESEND_API_KEY not configured"
    );
    return;
  }

  if (!receipt.customerEmail) {
    console.info(
      "Skipping booking confirmation email: no customer email provided"
    );
    return;
  }

  try {
    const chargedAmount = formatCurrency(
      receipt.chargedAmount.amount,
      receipt.chargedAmount.currency
    );

    const flight = receipt.flight;
    const stay = receipt.stay;
    const travelerSummary = buildTravelerSummary(receipt.travelers);

    const flightRoute = flight
      ? [flight.departureAirport, flight.arrivalAirport]
          .filter(Boolean)
          .join(" → ")
      : "";
    const departureTime = formatDateTime(flight?.departureTime);
    const arrivalTime = formatDateTime(flight?.arrivalTime);

    const stayAddress = stay
      ? [stay.addressLine, stay.location].filter(Boolean).join(", ")
      : "";
    const stayNightly = formatMoneyValue(stay?.nightlyRate);
    const stayTotal = formatMoneyValue(stay?.totalPrice);

    const textLines: string[] = [
      "Thanks for booking with Travel-AI!",
      "",
      `Confirmation: ${receipt.confirmationNumber}`,
      `Trip: ${receipt.itineraryHeadline}`,
      `Total charged: ${chargedAmount}`,
    ];

    if (flight) {
      textLines.push(
        "",
        "Flight details:",
        `• ${flight.airline} ${flight.flightNumber}${
          flightRoute ? ` (${flightRoute})` : ""
        }`
      );
      if (departureTime) {
        textLines.push(`• Departure: ${departureTime}`);
      }
      if (arrivalTime) {
        textLines.push(`• Arrival: ${arrivalTime}`);
      }
    }

    if (stay) {
      textLines.push("", "Hotel stay:", `• ${stay.name}`);
      if (stayAddress) {
        textLines.push(`• Address: ${stayAddress}`);
      }
      if (stay.checkIn) {
        textLines.push(`• Check-in: ${stay.checkIn}`);
      }
      if (stay.checkOut) {
        textLines.push(`• Check-out: ${stay.checkOut}`);
      }
      if (stayNightly) {
        textLines.push(`• Nightly rate: ${stayNightly}`);
      }
      if (stayTotal) {
        textLines.push(`• Hotel total: ${stayTotal}`);
      }
    }

    if (travelerSummary) {
      textLines.push("", "Travellers:", ...travelerSummary.text);
    }

    textLines.push(
      "",
      "You can reference this number when speaking with our travel team.",
      "We will send any schedule changes or reminders to this email. Safe travels!"
    );

    const text = textLines.join("\n");

    const flightHtmlSection = flight
      ? `<div style="margin-top: 24px;">
          <p style="text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: rgba(148, 163, 184, 0.8); margin: 0 0 8px;">Flight details</p>
          <div style="background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 14px; padding: 16px;">
            <p style="font-size: 15px; font-weight: 600; margin: 0; color: #f8fafc;">${
              flight.airline
            } ${flight.flightNumber}</p>
            ${
              flightRoute
                ? `<p style="margin: 6px 0 0; font-size: 12px; color: rgba(148, 163, 184, 0.8);">${flightRoute}</p>`
                : ""
            }
            <ul style="margin: 12px 0 0; padding-left: 18px; color: #f8fafc; font-size: 13px;">
              ${
                departureTime
                  ? `<li><strong>Departure:</strong> ${departureTime}</li>`
                  : ""
              }
              ${
                arrivalTime
                  ? `<li><strong>Arrival:</strong> ${arrivalTime}</li>`
                  : ""
              }
            </ul>
          </div>
        </div>`
      : "";

    const stayHtmlSection = stay
      ? `<div style="margin-top: 24px;">
          <p style="text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: rgba(148, 163, 184, 0.8); margin: 0 0 8px;">Hotel stay</p>
          <div style="background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 14px; padding: 16px;">
            <p style="font-size: 15px; font-weight: 600; margin: 0; color: #f8fafc;">${
              stay.name
            }</p>
            ${
              stayAddress
                ? `<p style="margin: 6px 0 0; font-size: 12px; color: rgba(148, 163, 184, 0.8);">${stayAddress}</p>`
                : ""
            }
            <ul style="margin: 12px 0 0; padding-left: 18px; color: #f8fafc; font-size: 13px;">
              ${
                stay.checkIn
                  ? `<li><strong>Check-in:</strong> ${stay.checkIn}</li>`
                  : ""
              }
              ${
                stay.checkOut
                  ? `<li><strong>Check-out:</strong> ${stay.checkOut}</li>`
                  : ""
              }
              ${
                stayNightly
                  ? `<li><strong>Nightly rate:</strong> ${stayNightly}</li>`
                  : ""
              }
              ${
                stayTotal
                  ? `<li><strong>Hotel total:</strong> ${stayTotal}</li>`
                  : ""
              }
            </ul>
          </div>
        </div>`
      : "";

    const travelerHtmlSection = travelerSummary
      ? `<div style="margin-top: 24px;">
          <p style="text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: rgba(148, 163, 184, 0.8); margin: 0 0 8px;">Travellers</p>
          <div style="background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 14px; padding: 16px;">
            ${travelerSummary.html}
          </div>
        </div>`
      : "";

    const html = `<!doctype html>
<html lang="en" style="font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px;">
  <body style="margin:0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; margin: 0 auto; background: #020617; border-radius: 18px; border: 1px solid rgba(148, 163, 184, 0.25);">
      <tr>
        <td style="padding: 32px;">
          <p style="text-transform: uppercase; letter-spacing: 0.12em; color: #34d399; font-size: 12px; margin: 0;">Booking confirmed</p>
          <h1 style="font-size: 24px; margin: 12px 0 8px;">${receipt.itineraryHeadline}</h1>
          <p style="margin: 0 0 16px; color: rgba(248, 250, 252, 0.78);">Reference <strong>${receipt.confirmationNumber}</strong></p>

          <table cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0; border-collapse: separate; border-spacing: 0 8px;">
            <tr>
              <td style="color: rgba(148, 163, 184, 0.9); font-size: 12px; text-transform: uppercase;">Total charged</td>
              <td style="text-align: right; font-size: 16px; font-weight: 600;">${chargedAmount}</td>
            </tr>
          </table>

          ${flightHtmlSection}
          ${stayHtmlSection}
          ${travelerHtmlSection}

          <p style="color: rgba(148, 163, 184, 0.8); font-size: 13px; line-height: 1.5; margin-top: 28px;">
            You’ll receive itinerary updates and reminders at this email address. If anything looks off, reply to this message and our travel coordinators will help you right away.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFrom,
        to: receipt.customerEmail,
        subject: `Travel-AI confirmation ${receipt.confirmationNumber}`,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to send booking confirmation email", errorText);
    }
  } catch (error) {
    console.error("Booking confirmation email error", error);
  }
}
