import { test, expect } from "@playwright/test";

const analyzeResponse = {
  success: true,
  video: {
    title: "E2E Test Video",
    thumbnail: "",
    duration: 125,
    source: "example.com",
  },
  formats: [
    { id: "1080p-mp4", type: "video", container: "mp4", resolution: "1080p", estimatedSize: 45_000_000 },
    { id: "128kbps-mp3", type: "audio", container: "mp3", bitrateKbps: 128, estimatedSize: 2_000_000 },
  ],
};

test.describe("Homepage — download flow (happy path)", () => {
  test("analyze a URL, pick a format, watch progress, and reach completion", async ({ page }) => {
    await page.route("**/api/video/analyze", (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(analyzeResponse) }),
    );

    await page.route("**/api/video/download", (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ jobId: "e2e-job-1" }) }),
    );

    let pollCount = 0;
    await page.route("**/api/video/jobs/e2e-job-1", (route) => {
      pollCount += 1;
      const body =
        pollCount < 2
          ? { id: "e2e-job-1", status: "processing", progress: 45 }
          : { id: "e2e-job-1", status: "completed", progress: 100 };
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });

    // The completion handler navigates a hidden <a> to this URL — no
    // need to fulfill real bytes for the test to prove the flow wired
    // up correctly end to end.
    await page.route("**/api/video/jobs/e2e-job-1/file", (route) =>
      route.fulfill({ status: 200, contentType: "video/mp4", body: "fake video bytes" }),
    );

    await page.goto("/");

    await page.getByPlaceholder("Paste video URL here...").fill("https://example.com/video");
    await page.getByRole("button", { name: /analyze video/i }).click();

    await expect(page.getByText("Analyzing video…")).toBeVisible();
    await expect(page.getByText("E2E Test Video")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("example.com")).toBeVisible();

    await page.getByRole("button", { name: /download 1080p mp4/i }).click();

    await expect(page.getByText(/preparing your download/i)).toBeVisible();

    // Wait through the polling cycle to completion — the panel returns
    // to idle shortly after the download is handed off to the browser.
    await expect(page.getByPlaceholder("Paste video URL here...")).toBeVisible({ timeout: 10_000 });
  });

  test("shows a friendly error for an invalid URL", async ({ page }) => {
    await page.route("**/api/video/analyze", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "Please enter a valid video URL.", code: "INVALID_URL" }),
      }),
    );

    await page.goto("/");
    await page.getByPlaceholder("Paste video URL here...").fill("not-a-real-url-but-has-enough-chars");
    await page.getByRole("button", { name: /analyze video/i }).click();

    await expect(page.getByText("Please enter a valid video URL.")).toBeVisible();
  });
});
