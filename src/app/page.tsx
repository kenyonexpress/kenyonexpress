import { Suspense } from "react";
import { BrandStrip } from "@/components/brand-strip";
import { CategoryRail } from "@/components/category-rail";
import { DealsSection } from "@/components/deals-section";
import { DealsSectionSkeleton } from "@/components/deals-section-skeleton";
import { Hero } from "@/components/hero";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <CategoryRail />
        <Suspense fallback={<DealsSectionSkeleton />}>
          <DealsSection />
        </Suspense>
        <BrandStrip />
      </main>
      <SiteFooter />
    </>
  );
}
