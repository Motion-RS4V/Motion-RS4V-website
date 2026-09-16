import type { EmailProvider, OutgoingEmail } from "@/server/email/providers";
import type { PaymentGateway, RazorpayOrder, RazorpayPayment, RazorpayRefund } from "./razorpay";

/** In-memory stand-in for Razorpay, for tests only. */
export function fakeGateway() {
  let counter = 0;
  const orders = new Map<string, RazorpayOrder>();
  const payments = new Map<string, RazorpayPayment>();
  const refunds: RazorpayRefund[] = [];
  const next = (prefix: string) => `${prefix}_test${Date.now().toString(36)}${(counter++).toString(36)}`;

  const gateway: PaymentGateway & {
    orders: typeof orders;
    payments: typeof payments;
    refunds: typeof refunds;
    failNextOrder: boolean;
    /** Status new refunds start in. Real Razorpay refunds usually start "pending". */
    refundStatus: RazorpayRefund["status"];
    /** Simulates the customer paying an order. */
    pay(orderId: string, opts?: { status?: RazorpayPayment["status"]; amount?: number }): string;
  } = {
    keyId: "rzp_test_fake",
    orders,
    payments,
    refunds,
    failNextOrder: false,
    refundStatus: "processed",
    async createOrder({ amountPaise, receipt }) {
      if (gateway.failNextOrder) {
        gateway.failNextOrder = false;
        throw new Error("fake order failure");
      }
      const order = { id: next("order"), amount: amountPaise, currency: "INR", receipt, status: "created" };
      orders.set(order.id, order);
      return order;
    },
    pay(orderId, opts = {}) {
      const order = orders.get(orderId);
      if (!order) throw new Error(`no fake order ${orderId}`);
      const payment: RazorpayPayment = { id: next("pay"), order_id: orderId, amount: opts.amount ?? order.amount, currency: "INR", status: opts.status ?? "captured" };
      payments.set(payment.id, payment);
      return payment.id;
    },
    async fetchPayment(id) {
      const p = payments.get(id);
      if (!p) throw new Error(`no fake payment ${id}`);
      return { ...p };
    },
    async capturePayment(id) {
      const p = payments.get(id)!;
      p.status = "captured";
      return { ...p };
    },
    async refundPayment(id, { amountPaise }) {
      const p = payments.get(id)!;
      const refund: RazorpayRefund = { id: next("rfnd"), payment_id: id, amount: amountPaise, status: gateway.refundStatus };
      refunds.push(refund);
      p.amount_refunded = (p.amount_refunded ?? 0) + amountPaise;
      if (p.amount_refunded >= p.amount) p.status = "refunded";
      return { ...refund };
    },
    async fetchRefund(paymentId, refundId) {
      const r = refunds.find((x) => x.id === refundId && x.payment_id === paymentId);
      if (!r) throw new Error(`no fake refund ${refundId}`);
      return { ...r };
    },
  };
  return gateway;
}

/** Captures emails instead of sending them. */
export function fakeEmailProvider() {
  const sent: OutgoingEmail[] = [];
  const provider: EmailProvider & { sent: OutgoingEmail[] } = {
    name: "console",
    sent,
    async send(email) {
      sent.push(email);
      return { id: `fake-${sent.length}` };
    },
  };
  return provider;
}
