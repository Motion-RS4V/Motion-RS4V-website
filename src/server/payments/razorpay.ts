import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal Razorpay REST client. Only the calls the booking flow needs, behind an interface
 * so tests can substitute a fake gateway and no test ever touches the real API.
 */

export type RazorpayOrder = { id: string; amount: number; currency: string; receipt: string | null; status: string };

export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method?: string;
  amount_refunded?: number;
  error_description?: string | null;
};

export type RazorpayRefund = { id: string; payment_id: string; amount: number; status: "pending" | "processed" | "failed" };

export interface PaymentGateway {
  readonly keyId: string;
  createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<RazorpayOrder>;
  fetchPayment(paymentId: string): Promise<RazorpayPayment>;
  capturePayment(paymentId: string, amountPaise: number): Promise<RazorpayPayment>;
  refundPayment(paymentId: string, input: { amountPaise: number; notes: Record<string, string> }): Promise<RazorpayRefund>;
}

export class RazorpayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RazorpayError";
  }
}

const API = "https://api.razorpay.com/v1";

export function razorpayGateway(keyId: string, keySecret: string): PaymentGateway {
  const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: auth, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; description?: string } };
    if (!res.ok) {
      throw new RazorpayError(res.status, json.error?.code ?? "UNKNOWN", json.error?.description ?? `Razorpay request failed (${res.status})`);
    }
    return json as T;
  }

  return {
    keyId,
    createOrder: ({ amountPaise, receipt, notes }) =>
      call<RazorpayOrder>("POST", "/orders", { amount: amountPaise, currency: "INR", receipt, notes }),
    fetchPayment: (id) => call<RazorpayPayment>("GET", `/payments/${encodeURIComponent(id)}`),
    capturePayment: (id, amountPaise) =>
      call<RazorpayPayment>("POST", `/payments/${encodeURIComponent(id)}/capture`, { amount: amountPaise, currency: "INR" }),
    refundPayment: (id, { amountPaise, notes }) =>
      call<RazorpayRefund>("POST", `/payments/${encodeURIComponent(id)}/refund`, { amount: amountPaise, speed: "normal", notes }),
  };
}

function safeEqualHex(expectedHex: string, receivedHex: string): boolean {
  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(receivedHex, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/** Checks the signature Razorpay Checkout returns to the browser: HMAC-SHA256 of "order_id|payment_id". */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  if (!/^[0-9a-f]+$/i.test(signature)) return false;
  const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Checks a webhook's X-Razorpay-Signature: HMAC-SHA256 of the raw request body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  if (!webhookSecret || !/^[0-9a-f]+$/i.test(signature)) return false;
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
