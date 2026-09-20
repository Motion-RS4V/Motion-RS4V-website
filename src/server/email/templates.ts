/**
 * Transactional email templates. Rendered in our code (not a provider dashboard) so they look the same
 * whichever service sends them, and every value is HTML-escaped because names come from customers.
 */

type DriverLine = { count: number; experience: string; track: string };
type SessionInfo = { name: string; reference: string; dateLabel: string; timeLabel: string };

export type TemplateData = {
  "booking.confirmed": SessionInfo & {
    drivers: DriverLine[];
    totalLabel: string;
    manageUrl: string;
    arriveEarlyMinutes: number;
    address: string;
    mapsUrl: string;
  };
  "booking.rescheduled": SessionInfo & { manageUrl: string; arriveEarlyMinutes: number };
  "booking.cancelled": SessionInfo & {
    partial: boolean;
    seatsCancelled: number;
    refundLabel: string | null;
    /** Paid at the desk, so it's handed back in cash there. */
    deskRefundLabel?: string | null;
    manageUrl: string | null;
  };
  "booking.unavailable_refunded": SessionInfo & { refundLabel: string };
  "booking.links": { name: string; bookings: { reference: string; dateLabel: string; timeLabel: string; manageUrl: string }[] };
};

export type TemplateName = keyof TemplateData;
export type RenderedEmail = { subject: string; html: string; text: string };

export function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = escapeHtml;

const BOOKING_FOOTER = "You're receiving this because a booking was made with this email address.";

function layout(preheader: string, body: string, footer = BOOKING_FOOTER): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Motion RS4V</title></head>
<body style="margin:0;padding:0;background:#f3f0e9;font-family:Arial,Helvetica,sans-serif;color:#141413;">
<span style="display:none;max-height:0;overflow:hidden;">${e(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0e9;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:4px;overflow:hidden;">
<tr><td style="background:#0b0c0e;padding:20px 28px;">
<span style="font-size:10px;letter-spacing:3px;color:#3aa0ff;font-weight:bold;">MOTION</span>
<span style="font-size:22px;font-weight:900;color:#f3f0e9;letter-spacing:1px;"> RS<span style="color:#e4292f;">4</span>V</span>
</td></tr>
<tr><td style="padding:28px;">${body}</td></tr>
<tr><td style="padding:18px 28px;background:#faf9f5;border-top:1px solid #eeeae1;font-size:12px;line-height:18px;color:#7a766f;">
Motion RS4V · Drive Beyond Reality<br>${e(footer)}
</td></tr>
</table></td></tr></table></body></html>`;
}

function heading(text: string) {
  return `<h1 style="margin:0 0 10px;font-size:26px;line-height:30px;font-weight:900;color:#0b0c0e;">${e(text)}</h1>`;
}

function paragraph(html: string) {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:23px;color:#3d3b37;">${html}</p>`;
}

function button(label: string, url: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;"><tr><td style="background:#ff6b2c;border-radius:2px;">
<a href="${e(url)}" style="display:inline-block;padding:14px 22px;font-size:13px;font-weight:bold;letter-spacing:1px;color:#1a0c04;text-decoration:none;">${e(label)}</a>
</td></tr></table>`;
}

function details(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;border-top:1px solid #eeeae1;">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #eeeae1;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#7a766f;width:40%;">${e(label)}</td><td style="padding:10px 0;border-bottom:1px solid #eeeae1;font-size:14px;color:#0b0c0e;text-align:right;">${value}</td></tr>`,
    )
    .join("")}</table>`;
}

function driversHtml(drivers: DriverLine[]) {
  return drivers.map((d) => `${e(d.count)} × ${e(d.experience)} <span style="color:#7a766f;">(${e(d.track)})</span>`).join("<br>");
}

function driversText(drivers: DriverLine[]) {
  return drivers.map((d) => `${d.count} × ${d.experience} (${d.track})`).join(", ");
}

/** Staff "forgotten password" email. Sent straight away and never stored, since the link signs someone in. */
export function renderStaffResetEmail(link: string): RenderedEmail {
  return {
    subject: "Reset your Motion RS4V console password",
    html: layout(
      "Choose a new password for the venue console.",
      heading("Reset your password.") +
        paragraph("Someone asked to reset the password for this venue console account. Use the button to choose a new one.") +
        button("Choose a new password", link) +
        paragraph(`<span style="font-size:13px;color:#7a766f;">The link works once and expires in an hour. If you didn't ask for this, ignore this email; your password stays the same.</span>`),
      "You're receiving this because a password reset was requested for your staff account.",
    ),
    text: [
      "Reset your Motion RS4V console password.",
      "",
      `Choose a new password: ${link}`,
      "",
      "The link works once and expires in an hour. If you didn't ask for this, ignore this email.",
    ].join("\n"),
  };
}

export function renderEmail<T extends TemplateName>(template: T, data: TemplateData[T]): RenderedEmail {
  switch (template) {
    case "booking.confirmed": {
      const d = data as TemplateData["booking.confirmed"];
      return {
        subject: `You're booked: ${d.dateLabel}, ${d.timeLabel.split(" – ")[0]} · ${d.reference}`,
        html: layout(
          `Booking ${d.reference} is confirmed.`,
          heading("You're booked.") +
            paragraph(`Hi ${e(d.name)}, your session is confirmed. Show your booking reference or the QR code at the desk.`) +
            details([
              ["Reference", `<strong>${e(d.reference)}</strong>`],
              ["Date", e(d.dateLabel)],
              ["Time", e(d.timeLabel)],
              ["Drivers", driversHtml(d.drivers)],
              ["Paid", e(d.totalLabel)],
            ]) +
            button("View or manage booking", d.manageUrl) +
            paragraph(
              `Please arrive <strong>${e(d.arriveEarlyMinutes)} minutes early</strong>. Staff assign each driver a car for their track when you arrive. ${
                d.mapsUrl ? `<a href="${e(d.mapsUrl)}" style="color:#d94f14;">${e(d.address)}</a>` : e(d.address)
              }`,
            ) +
            paragraph(`<span style="font-size:13px;color:#7a766f;">Keep this email private: the button above lets anyone with it change or cancel the booking.</span>`),
        ),
        text: [
          `You're booked, ${d.name}.`,
          `Reference: ${d.reference}`,
          `Date: ${d.dateLabel}`,
          `Time: ${d.timeLabel}`,
          `Drivers: ${driversText(d.drivers)}`,
          `Paid: ${d.totalLabel}`,
          ``,
          `View or manage your booking: ${d.manageUrl}`,
          `Arrive ${d.arriveEarlyMinutes} minutes early. ${d.address}`,
          `Keep this email private: the link lets anyone with it change or cancel the booking.`,
        ].join("\n"),
      };
    }

    case "booking.rescheduled": {
      const d = data as TemplateData["booking.rescheduled"];
      return {
        subject: `Booking moved: ${d.dateLabel}, ${d.timeLabel.split(" – ")[0]} · ${d.reference}`,
        html: layout(
          `Booking ${d.reference} has a new time.`,
          heading("Your booking has moved.") +
            paragraph(`Hi ${e(d.name)}, here's your new session.`) +
            details([
              ["Reference", `<strong>${e(d.reference)}</strong>`],
              ["New date", e(d.dateLabel)],
              ["New time", e(d.timeLabel)],
            ]) +
            button("View booking", d.manageUrl) +
            paragraph(`Please arrive ${e(d.arriveEarlyMinutes)} minutes early.`),
        ),
        text: `Your booking has moved, ${d.name}.\nReference: ${d.reference}\nNew date: ${d.dateLabel}\nNew time: ${d.timeLabel}\n\nView booking: ${d.manageUrl}`,
      };
    }

    case "booking.cancelled": {
      const d = data as TemplateData["booking.cancelled"];
      const what = d.partial ? `${d.seatsCancelled} driver${d.seatsCancelled === 1 ? "" : "s"} removed from your booking` : "Booking cancelled";
      const refund = d.deskRefundLabel
        ? `A refund of <strong>${e(d.deskRefundLabel)}</strong> is waiting for you at the desk, because this booking was paid there. Please bring your booking reference.`
        : d.refundLabel
          ? `A refund of <strong>${e(d.refundLabel)}</strong> is on its way to your original payment method. Banks usually take 5–7 working days.`
          : "No refund applies to this cancellation.";
      return {
        subject: `${what} · ${d.reference}`,
        html: layout(
          `${what}.`,
          heading(d.partial ? "Drivers removed." : "Booking cancelled.") +
            paragraph(`Hi ${e(d.name)}, this is to confirm the change to ${e(d.reference)} (${e(d.dateLabel)}, ${e(d.timeLabel)}).`) +
            paragraph(refund) +
            (d.partial && d.manageUrl ? button("View updated booking", d.manageUrl) : ""),
        ),
        text: `${what}.\nReference: ${d.reference} (${d.dateLabel}, ${d.timeLabel})\n${
          d.deskRefundLabel
            ? `Refund: ${d.deskRefundLabel}, collect it at the desk.`
            : d.refundLabel
              ? `Refund: ${d.refundLabel}, usually 5–7 working days.`
              : "No refund applies."
        }${d.partial && d.manageUrl ? `\nView booking: ${d.manageUrl}` : ""}`,
      };
    }

    case "booking.unavailable_refunded": {
      const d = data as TemplateData["booking.unavailable_refunded"];
      return {
        subject: `We couldn't hold your seats · full refund · ${d.reference}`,
        html: layout(
          "Your payment has been refunded in full.",
          heading("Sorry, those seats went.") +
            paragraph(
              `Hi ${e(d.name)}, your payment for ${e(d.dateLabel)}, ${e(d.timeLabel)} arrived after your seat hold ran out, and the seats had already been taken.`,
            ) +
            paragraph(`We've refunded <strong>${e(d.refundLabel)}</strong> in full. Banks usually take 5–7 working days. Please pick another time.`),
        ),
        text: `Sorry ${d.name}, the seats for ${d.dateLabel}, ${d.timeLabel} were taken before your payment arrived. We've refunded ${d.refundLabel} in full (usually 5–7 working days).`,
      };
    }

    case "booking.links": {
      const d = data as TemplateData["booking.links"];
      return {
        subject: "Your Motion RS4V booking links",
        html: layout(
          "Links to view or manage your bookings.",
          heading("Your bookings.") +
            paragraph(`Hi ${e(d.name)}, here ${d.bookings.length === 1 ? "is the link" : "are the links"} you asked for.`) +
            d.bookings
              .map(
                (b) =>
                  details([
                    ["Reference", `<strong>${e(b.reference)}</strong>`],
                    ["When", `${e(b.dateLabel)}, ${e(b.timeLabel)}`],
                  ]) + button("Manage this booking", b.manageUrl),
              )
              .join("") +
            paragraph(`<span style="font-size:13px;color:#7a766f;">Didn't ask for this? You can ignore it. Nobody can change your booking without these links.</span>`),
        ),
        text: `Your bookings, ${d.name}:\n\n${d.bookings.map((b) => `${b.reference} · ${b.dateLabel}, ${b.timeLabel}\n${b.manageUrl}`).join("\n\n")}`,
      };
    }
  }
  throw new Error(`Unknown email template: ${String(template)}`);
}
