import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyCheckoutSignature, verifyWebhookSignature } from "./razorpay";

const SECRET = "test_secret_value_123";

describe("Razorpay signatures", () => {
  it("accepts a genuine checkout signature and rejects tampering", () => {
    const sig = createHmac("sha256", SECRET).update("order_ABC|pay_XYZ").digest("hex");
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", sig, SECRET)).toBe(true);
    expect(verifyCheckoutSignature("order_ABC", "pay_OTHER", sig, SECRET)).toBe(false);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", sig, "wrong_secret")).toBe(false);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", "not-hex!", SECRET)).toBe(false);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", "", SECRET)).toBe(false);
  });

  it("verifies webhooks against the exact raw body", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    const sig = createHmac("sha256", "whsec").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, "whsec")).toBe(true);
    expect(verifyWebhookSignature(body + " ", sig, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, sig, "")).toBe(false);
  });
});
