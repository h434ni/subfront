import { describe, expect, test } from "bun:test";
import {
  appendConfigsToEncodedSubscription,
  normalizeProxyUrl,
  parseSubscriptionHtml,
} from "./subscription.ts";

describe("normalizeProxyUrl", () => {
  test("keeps complete proxy URLs unchanged", () => {
    expect(normalizeProxyUrl("http://127.0.0.1:10808")).toBe("http://127.0.0.1:10808");
    expect(normalizeProxyUrl("socks5://127.0.0.1:10808")).toBe("socks5://127.0.0.1:10808");
  });

  test("adds an http scheme to host and port values", () => {
    expect(normalizeProxyUrl("127.0.0.1:10808")).toBe("http://127.0.0.1:10808");
  });

  test("returns undefined for empty proxy settings", () => {
    expect(normalizeProxyUrl()).toBeUndefined();
    expect(normalizeProxyUrl("   ")).toBeUndefined();
  });
});

describe("parseSubscriptionHtml", () => {
  test("extracts subscription stats from page data", () => {
    const stats = parseSubscriptionHtml(`
      <script>
        window.__SUB_PAGE_DATA__ = {"download":"10 GB","upload":"2 GB","used":"12 GB","total":"50 GB","expire":0};
      </script>
    `);

    expect(stats.download).toBe("10 GB");
    expect(stats.upload).toBe("2 GB");
    expect(stats.used).toBe("12 GB");
    expect(stats.total).toBe("50 GB");
    expect(stats.expireText).toBe("No expiration / Unlimited");
  });
});

describe("appendConfigsToEncodedSubscription", () => {
  test("appends extra configs to an encoded subscription", () => {
    const encoded = Buffer.from("vless://one\n\nvless://two", "utf-8").toString("base64");
    const result = appendConfigsToEncodedSubscription(encoded, ["vless://three"]);
    const decoded = Buffer.from(result, "base64").toString("utf-8");

    expect(decoded).toBe("vless://one\nvless://two\nvless://three");
  });
});
