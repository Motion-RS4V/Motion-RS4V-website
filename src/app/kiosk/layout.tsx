import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Book a drive", robots: { index: false, follow: false } };

/** A fixed screen: no pinch-zoom, and the page never scrolls the address bar into view. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return children;
}
