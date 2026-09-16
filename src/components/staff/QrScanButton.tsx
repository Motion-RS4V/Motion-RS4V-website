"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./QrScan.module.css";

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => Detector;
  }
}

/**
 * Scans a customer's booking QR code with the device camera.
 * Uses the browser's built-in reader where there is one (Android, ChromeOS, macOS) and falls back to
 * decoding frames ourselves, so it also works on Windows laptops and older browsers.
 */
export function QrScanButton({ onScan }: { onScan: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let frame = 0;

    async function readFrame(video: HTMLVideoElement, detector: Detector | null, decode: ((data: ImageData) => string | null) | null) {
      if (detector) {
        const [hit] = await detector.detect(video);
        return hit?.rawValue ?? null;
      }
      const canvas = canvasRef.current;
      if (!canvas || !decode || video.videoWidth === 0) return null;
      const size = Math.min(video.videoWidth, video.videoHeight);
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, size, size);
      return decode(context.getImageData(0, 0, size, size));
    }

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't use a camera. Type the booking reference or mobile number instead.");
        return;
      }
      let detector: Detector | null = null;
      let decode: ((data: ImageData) => string | null) | null = null;
      if (window.BarcodeDetector) {
        detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      } else {
        const jsQR = (await import("jsqr")).default;
        decode = (image) => jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const value = await readFrame(videoRef.current, detector, decode);
            if (value?.trim()) {
              onScan(value.trim());
              setOpen(false);
              return;
            }
          } catch {
            // An unreadable frame is normal; keep looking.
          }
          frame = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setError("The camera couldn't be opened. Check the browser's camera permission, or type the reference instead.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open, onScan]);

  return (
    <>
      <button
        type="button"
        className={`btn btn-ghost btn-sm ${styles.button}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-label="Scan booking QR code"
      >
        Scan
      </button>
      {open && (
        <div className={styles.overlay} role="dialog" aria-label="Scan a booking QR code">
          <div className={styles.frame}>
            <video ref={videoRef} playsInline muted className={styles.video} />
            <canvas ref={canvasRef} className={styles.canvas} />
            <p>{error ?? "Point the camera at the customer's QR code."}</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
