import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Reel to download video.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" effectiveDate="August 24, 2026">
      <LegalSection heading="Acceptable use">
        <p>
          Reel is a tool for downloading video and audio you own, have permission to download, or
          that's made available for downloading by its source. You're responsible for making sure
          your use of any link you submit complies with the copyright terms, platform rules, and
          laws that apply to it. Reel doesn't review the content of what you download and takes no
          position on any specific source or link.
        </p>
      </LegalSection>

      <LegalSection heading="No accounts required">
        <p>
          You don't need to register or sign in to use Reel. Every session is anonymous, tracked
          only by a temporary cookie described in the Privacy Policy — there's no account to
          create, and nothing to delete later, because nothing durable is kept in the first place.
        </p>
      </LegalSection>

      <LegalSection heading="Rate limits and fair use">
        <p>
          To keep the service usable for everyone, requests are rate-limited per visitor, and the
          number of downloads you can have processing at once is capped. These limits apply
          per-tier — analyzing a video, starting a download, and checking on a job's status each
          have their own limit — and are enforced automatically. Requests that exceed them are
          rejected with a clear rate-limit response rather than silently dropped.
        </p>
      </LegalSection>

      <LegalSection heading="Downloads are temporary">
        <p>
          A completed download is available for retrieval for a limited window and is deleted
          automatically afterward — see the Privacy Policy for specifics. If you don't retrieve a
          file before it expires, you'll need to start the download again.
        </p>
      </LegalSection>

      <LegalSection heading="No warranty">
        <p>
          Reel is provided as-is. Video sources it depends on are outside its control and can
          change or become unavailable at any time, which may cause an analysis or download to
          fail. There's no guarantee that any particular link will succeed, or that the service
          will be available without interruption.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the fullest extent permitted by law, the operator of this instance isn't liable for
          any indirect, incidental, or consequential damages arising from your use of the service,
          including damages related to content you download or a link's availability.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          These terms may be updated as the service changes. Continued use after an update means
          you accept the current version.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
