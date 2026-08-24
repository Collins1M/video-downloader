import { Hero } from "@/components/hero/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Features } from "@/components/marketing/features";
import { PrivacySection } from "@/components/marketing/privacy-section";
import { FAQ } from "@/components/marketing/faq";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Reel",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  description:
    "Download supported online videos in your preferred quality and format with a fast, simple video downloader.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Hero />
      <HowItWorks />
      <Features />
      <PrivacySection />
      <FAQ />
    </>
  );
}
