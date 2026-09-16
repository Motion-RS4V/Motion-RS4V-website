import { AttributionCapture } from "@/components/site/AttributionCapture";
import { Booking } from "@/components/site/Booking";
import { Faq } from "@/components/site/Faq";
import { Fpv } from "@/components/site/Fpv";
import { Hero } from "@/components/site/Hero";
import { HowItWorks } from "@/components/site/HowItWorks";
import { Proof } from "@/components/site/Proof";
import { FinalCta, SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { StickyBookBar } from "@/components/site/StickyBookBar";
import { Tracks } from "@/components/site/Tracks";
import { Venue } from "@/components/site/Venue";
import { YouTurn } from "@/components/site/YouTurn";
import { formatRupees } from "@/lib/format";
import { getSiteContent } from "@/server/site/content";

// Prices, hours and venue details change rarely: rebuild the page at most every 5 minutes.
// Live seat counts don't come from here; the booking picker fetches them fresh from /api/availability.
export const revalidate = 300;

export default async function HomePage() {
  const content = await getSiteContent();
  const price = `${content.hasPriceRules ? "From " : ""}${formatRupees(content.basePricePaise)}`;

  return (
    <>
      <AttributionCapture />
      <SiteHeader />
      <main>
        <Hero content={content} />
        <YouTurn />
        <HowItWorks driveMinutes={content.driveMinutes} arriveEarlyMinutes={content.arriveEarlyMinutes} />
        <Fpv />
        <Proof />
        <Tracks experiences={content.experiences} />
        <Booking content={content} />
        <Venue content={content} />
        <Faq content={content} />
        <FinalCta content={content} />
      </main>
      <SiteFooter content={content} />
      <StickyBookBar priceLabel={price} driveMinutes={content.driveMinutes} />
    </>
  );
}
