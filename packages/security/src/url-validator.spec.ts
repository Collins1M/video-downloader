import { describe, it, expect, vi, beforeEach } from "vitest";

const lookupMock = vi.fn();

vi.mock("node:dns", () => ({
  promises: {
    lookup: (...args: unknown[]) => lookupMock(...args),
  },
}));

// Import after the mock is registered so the module under test picks up
// the mocked node:dns.
const { validateUrl, UnsafeUrlError } = await import("./url-validator");

describe("validateUrl", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  describe("protocol", () => {
    it("rejects non-http(s) schemes", async () => {
      await expect(validateUrl("file:///etc/passwd")).rejects.toThrow(UnsafeUrlError);
      await expect(validateUrl("ftp://example.com/video")).rejects.toThrow(UnsafeUrlError);
      await expect(validateUrl("data:text/plain,hello")).rejects.toThrow(UnsafeUrlError);
      await expect(validateUrl("gopher://example.com")).rejects.toThrow(UnsafeUrlError);
    });

    it("rejects malformed URLs", async () => {
      await expect(validateUrl("not a url")).rejects.toThrow(UnsafeUrlError);
      await expect(validateUrl("")).rejects.toThrow(UnsafeUrlError);
    });
  });

  describe("obviously-blocked hostnames", () => {
    it("rejects localhost", async () => {
      await expect(validateUrl("http://localhost/video")).rejects.toThrow(UnsafeUrlError);
      await expect(validateUrl("http://localhost.localdomain/video")).rejects.toThrow(UnsafeUrlError);
    });

    it("rejects .local/.internal/.lan and bare hostnames", async () => {
      await expect(validateUrl("http://printer.local/video")).rejects.toThrow(UnsafeUrlError);
      await expect(validateUrl("http://service.internal/video")).rejects.toThrow(UnsafeUrlError);
      await expect(validateUrl("http://box.lan/video")).rejects.toThrow(UnsafeUrlError);
      await expect(validateUrl("http://router/video")).rejects.toThrow(UnsafeUrlError);
    });
  });

  describe("literal IP hosts", () => {
    it("rejects private/loopback/link-local/reserved IPv4 literals", async () => {
      const blocked = [
        "http://127.0.0.1/video",
        "http://10.0.0.5/video",
        "http://172.16.5.5/video",
        "http://192.168.1.1/video",
        "http://169.254.1.1/video",
        "http://100.64.0.1/video", // CGNAT
        "http://0.0.0.0/video",
        "http://203.0.113.5/video", // TEST-NET-3, reserved
      ];
      for (const url of blocked) {
        await expect(validateUrl(url), url).rejects.toThrow(UnsafeUrlError);
      }
    });

    it("rejects loopback/link-local/unique-local IPv6 literals, including IPv4-mapped tricks", async () => {
      const blocked = [
        "http://[::1]/video",
        "http://[fe80::1]/video",
        "http://[fc00::1]/video",
        "http://[::ffff:127.0.0.1]/video", // IPv4-mapped IPv6 loopback bypass attempt
      ];
      for (const url of blocked) {
        await expect(validateUrl(url), url).rejects.toThrow(UnsafeUrlError);
      }
    });

    it("allows a public IPv4 literal", async () => {
      await expect(validateUrl("http://8.8.8.8/video")).resolves.toBeInstanceOf(URL);
    });

    it("allows a public IPv6 literal", async () => {
      await expect(validateUrl("http://[2001:4860:4860::8888]/video")).resolves.toBeInstanceOf(URL);
    });
  });

  describe("DNS resolution (rebinding protection)", () => {
    it("rejects a hostname that resolves to a private IP", async () => {
      lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
      await expect(validateUrl("http://sneaky.example.com/video")).rejects.toThrow(UnsafeUrlError);
    });

    it("rejects if ANY resolved address is unsafe, even with a public one present", async () => {
      lookupMock.mockResolvedValue([
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]);
      await expect(validateUrl("http://multi-homed.example.com/video")).rejects.toThrow(UnsafeUrlError);
    });

    it("allows a hostname that resolves only to public addresses", async () => {
      lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
      await expect(validateUrl("http://example.com/video")).resolves.toBeInstanceOf(URL);
    });

    it("rejects when DNS resolution fails", async () => {
      lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
      await expect(validateUrl("http://does-not-exist.invalid/video")).rejects.toThrow(UnsafeUrlError);
    });

    it("does not call DNS lookup for literal IP hosts", async () => {
      await validateUrl("http://8.8.8.8/video");
      expect(lookupMock).not.toHaveBeenCalled();
    });
  });

  describe("error message consistency", () => {
    it("gives the same generic message for malformed vs. blocked URLs", async () => {
      // Deliberately not leaking *why* something was rejected — see the
      // comment in url-validator.ts on why this matters.
      const malformedMessage = await validateUrl("not a url").catch((e) => e.message);
      const blockedMessage = await validateUrl("http://127.0.0.1/video").catch((e) => e.message);
      expect(malformedMessage).toBe(blockedMessage);
    });
  });
});
