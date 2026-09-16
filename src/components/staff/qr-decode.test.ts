import jsQR from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";

/**
 * The console's fallback scanner decodes camera frames with jsQR (browsers without a built-in reader,
 * such as Chrome and Edge on Windows). This proves a QR code we generate can be read back.
 */
describe("QR fallback decoding", () => {
  it("reads a booking reference out of a generated QR code", async () => {
    const reference = "RS4V-7K2M9Q";
    const size = 256;
    const buffer = Buffer.alloc(size * size * 4);
    await QRCode.toBuffer(reference, { type: "png", width: size, margin: 2 });

    // Build the raw RGBA frame the same way the scanner does, from the QR modules.
    const qr = await QRCode.create(reference, { errorCorrectionLevel: "M" });
    const modules = qr.modules;
    const scale = Math.floor(size / (modules.size + 4));
    const offset = Math.floor((size - modules.size * scale) / 2);
    buffer.fill(255);
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (!modules.get(x, y)) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = ((offset + y * scale + dy) * size + offset + x * scale + dx) * 4;
            buffer[px] = 0;
            buffer[px + 1] = 0;
            buffer[px + 2] = 0;
            buffer[px + 3] = 255;
          }
        }
      }
    }

    const result = jsQR(new Uint8ClampedArray(buffer), size, size, { inversionAttempts: "dontInvert" });
    expect(result?.data).toBe(reference);
  });
});
