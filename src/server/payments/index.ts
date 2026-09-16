import "server-only";

import { paymentsEnv } from "@/server/env";
import { razorpayGateway, type PaymentGateway } from "./razorpay";

export { CheckoutError, finalizePayment, releaseCheckout, startCheckout, type FinalizeResult, type StartedCheckout } from "./checkout";
export { emailBookingCancelled, emailBookingRescheduled, manageUrl } from "./notifications";
export { verifyCheckoutSignature, verifyWebhookSignature, type PaymentGateway } from "./razorpay";
export { markRefundPaid, refundBooking, retryRefund, syncPaymentRefundStatus } from "./refunds";

let gateway: PaymentGateway | undefined;

export function paymentGateway(): PaymentGateway {
  if (!gateway) {
    const env = paymentsEnv();
    gateway = razorpayGateway(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET);
  }
  return gateway;
}
