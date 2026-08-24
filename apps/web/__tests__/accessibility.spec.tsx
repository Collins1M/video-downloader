import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { UrlInputForm } from "@/components/hero/url-input-form";
import { AnalyzingState } from "@/components/hero/analyzing-state";
import { VideoInfoCard } from "@/components/hero/video-info-card";
import { FormatList } from "@/components/hero/format-list";
import { DownloadProgress } from "@/components/hero/download-progress";
import { FAQ } from "@/components/marketing/faq";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";

const video = {
  title: "A Test Video With A Reasonably Long Title",
  thumbnail: "",
  duration: 125,
  source: "example.com",
};

const formats = [
  { id: "1080p-mp4", type: "video" as const, container: "mp4", resolution: "1080p", estimatedSize: 1_000_000 },
  { id: "128kbps-mp3", type: "audio" as const, container: "mp3", bitrateKbps: 128, estimatedSize: 500_000 },
];

describe("Accessibility (axe)", () => {
  it("url input form (idle)", async () => {
    const { container } = render(
      <UrlInputForm url="" onUrlChange={() => {}} onSubmit={() => {}} disabled={false} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("url input form (with a URL entered, clear button visible)", async () => {
    const { container } = render(
      <UrlInputForm url="https://example.com/video" onUrlChange={() => {}} onSubmit={() => {}} disabled={false} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("url input form (submitting/disabled)", async () => {
    const { container } = render(
      <UrlInputForm url="https://example.com/video" onUrlChange={() => {}} onSubmit={() => {}} disabled={true} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("analyzing state", async () => {
    const { container } = render(<AnalyzingState />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("video info card", async () => {
    const { container } = render(<VideoInfoCard video={video} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("format list", async () => {
    const { container } = render(<FormatList formats={formats} onSelect={() => {}} disabled={false} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("format list (empty)", async () => {
    const { container } = render(<FormatList formats={[]} onSelect={() => {}} disabled={false} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("download progress", async () => {
    const { container } = render(
      <DownloadProgress progress={42} formatLabel="1080p · mp4" onCancel={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("FAQ (with a panel expanded)", async () => {
    const { container } = render(<FAQ />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("site header", async () => {
    const { container } = render(<SiteHeader />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("site footer", async () => {
    const { container } = render(<SiteFooter />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("legal page layout", async () => {
    const { container } = render(
      <LegalPage title="Terms of Service" effectiveDate="August 24, 2026">
        <LegalSection heading="Acceptable use">
          <p>Some legal copy.</p>
        </LegalSection>
      </LegalPage>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
