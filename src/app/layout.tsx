import type { Metadata, Viewport } from "next";
import { Archivo, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const display = Archivo({ variable: "--font-display", subsets: ["latin"], axes: ["wdth"] });
const body = Inter({ variable: "--font-body", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Motion RS4V · Drive a real car. Remotely.", template: "%s · Motion RS4V" },
  description:
    "Sit at a steering rig, see through a camera on a real car, and drive it around our circuit at Zora The Mall, Raipur.",
};

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Browser extensions (e.g. Liner) add attributes to <html> and <body> before React loads.
    // suppressHydrationWarning ignores attribute differences on these two elements only; the page content is still checked.
    // data-scroll-behavior="smooth": keep smooth scrolling for #anchors, but jump instantly when changing pages
    // (otherwise leaving the long home page animates a scroll across the whole new page).
    <html
      lang="en-IN"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
