import type {
  BookingResponse,
  BookingFlightSummary,
  BookingStaySummary,
} from "@/lib/types/travel";

const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM_EMAIL ?? "notifications@travel-ai.dev";

interface BookingEmailPayload {
  receipt: BookingResponse;
}

function formatSummaryLine(
  flight?: BookingFlightSummary,
  stay?: BookingStaySummary
): string {
  const parts: string[] = [];
  if (flight) {
    const route = [flight.departureAirport, flight.arrivalAirport]
      .filter(Boolean)
      .join(" → ");
    parts.push(
      `Flight: ${flight.airline} ${flight.flightNumber}${route ? ` (${route})` : ""}`
    );
  }

  if (stay) {
    const details = [stay.location, stay.checkIn && `Check-in ${stay.checkIn}`, stay.checkOut && `Check-out ${stay.checkOut}`]
      .filter(Boolean)
      .join(" · ");
    parts.push(`Stay: ${stay.name}${details ? ` (${details})` : ""}`);
  }

  return parts.join("\n");
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
  }).format(amount);
}

export async function sendBookingConfirmationEmail({
  receipt,
}: BookingEmailPayload): Promise<void> {
  if (!resendApiKey) {
    console.info("Skipping booking confirmation email: RESEND_API_KEY not configured");
    return;
  }

  if (!receipt.customerEmail) {
    console.info("Skipping booking confirmation email: no customer email provided");
    return;
  }

  try {
    const summaryLine = formatSummaryLine(receipt.flight, receipt.stay);
    const chargedAmount = formatCurrency(
      receipt.chargedAmount.amount,
      receipt.chargedAmount.currency
    );

    const text = `Thanks for booking with Travel-AI!\n\n` +
      `Confirmation: ${receipt.confirmationNumber}\n` +
      `Trip: ${receipt.itineraryHeadline}\n` +
      `Total: ${chargedAmount}\n` +
      (summaryLine ? `\n${summaryLine}\n` : "") +
      `\nYou can reference this number when speaking with our travel team. Safe travels!`;

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
            ${receipt.flight ? `<tr>
              <td style="color: rgba(148, 163, 184, 0.9); font-size: 12px; text-transform: uppercase; vertical-align: top;">Flight</td>
              <td style="text-align: right; font-size: 14px;">
                ${receipt.flight.airline} ${receipt.flight.flightNumber}<br />
                <span style="color: rgba(148, 163, 184, 0.8); font-size: 12px;">${[receipt.flight.departureAirport, receipt.flight.arrivalAirport].filter(Boolean).join(" → ")}</span>
              </td>
            </tr>` : ""}
            ${receipt.stay ? `<tr>
              <td style="color: rgba(148, 163, 184, 0.9); font-size: 12px; text-transform: uppercase; vertical-align: top;">Stay</td>
              <td style="text-align: right; font-size: 14px;">
                ${receipt.stay.name}<br />
                <span style="color: rgba(148, 163, 184, 0.8); font-size: 12px;">${[receipt.stay.location, receipt.stay.checkIn && `Check-in ${receipt.stay.checkIn}`, receipt.stay.checkOut && `Check-out ${receipt.stay.checkOut}`].filter(Boolean).join(" · ")}</span>
              </td>
            </tr>` : ""}
          </table>

          <p style="color: rgba(148, 163, 184, 0.8); font-size: 13px; line-height: 1.5;">
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
