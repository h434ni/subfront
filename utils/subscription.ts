import { execFileSync } from "child_process";

export interface SubscriptionStats {
  download: string;
  upload: string;
  used: string;
  total: string;
  expire: number;
  expireText: string;
  raw: Record<string, unknown>;
}

export interface SubscriptionFetchOptions {
  proxy?: string;
  acceptHeader?: string;
}

export interface SubscriptionAppendSettings {
  appendExpiration?: boolean;
  appendUsage?: boolean;
}

const DEFAULT_ACCEPT = "text/html,application/xhtml+xml";

export function normalizeProxyUrl(proxy?: string): string | undefined {
  const trimmed = proxy?.trim();
  if (!trimmed) return undefined;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function parseSubscriptionHtml(html: string): SubscriptionStats {
  const regex = /window\.__SUB_PAGE_DATA__\s*=\s*({.*?});/s;
  const match = html.match(regex);

  if (!match) {
    throw new Error("Subscription JSON was not found in page HTML.");
  }

  const jsonString = match[1];
  const data = JSON.parse(jsonString!) as Record<string, unknown>;

  const download = String(data.download ?? "N/A");
  const upload = String(data.upload ?? "N/A");
  const used = String(data.used ?? "N/A");
  const total = String(data.total ?? "N/A");
  const expire = typeof data.expire === "number" ? data.expire : 0;
  const expireText = expire > 0
    ? new Date(expire * 1000).toLocaleString()
    : "No expiration / Unlimited";

  return {
    download,
    upload,
    used,
    total,
    expire,
    expireText,
    raw: data,
  };
}

export function fetchSubscriptionPage(
  url: string,
  options: SubscriptionFetchOptions = {}
): string {
  const proxy = normalizeProxyUrl(options.proxy);
  const acceptHeader = options.acceptHeader ?? DEFAULT_ACCEPT;

  const args = [
    "-s",
    "-H",
    `Accept: ${acceptHeader}`,
    url,
  ];

  if (proxy) {
    args.splice(1, 0, "-x", proxy);
  } else {
    args.splice(1, 0, "--noproxy", "*");
  }

  return execFileSync("curl", args, {
    encoding: "utf-8",
    env: {
      ...process.env,
      NO_PROXY: proxy ? "" : "*",
      no_proxy: proxy ? "" : "*",
    },
  });
}

export function getSubscriptionStats(
  url: string,
  options: SubscriptionFetchOptions = {}
): SubscriptionStats {
  const html = fetchSubscriptionPage(url, options);
  return parseSubscriptionHtml(html);
}

export function buildCustomSubscriptionConfigs(
  stats: SubscriptionStats,
  settings: SubscriptionAppendSettings = {}
): string[] {
  const createConfig = (label: string) =>
    `vless://702ae8dd-64a5-4344-aec4-7e19cd9171ba@1:1?encryption=none&security=none&type=tcp&headerType=http&host=speedtest.net&path=%2F#${encodeURIComponent(
      label
    )}`;

  const lines: string[] = [];

  if (settings.appendExpiration) {
    const expirationLabel = stats.expire > 0
      ? `📛${stats.expireText}📛`
      : `📛نامحدود📛`;
    lines.push(createConfig(expirationLabel));
  }

  if (settings.appendUsage) {
    const usageLabel = `📊${stats.used} / ${stats.total}📊 باقی‌مانده`;
    lines.push(createConfig(usageLabel));
  }

  return lines;
}

export function appendConfigsToEncodedSubscription(
  encodedContent: string,
  extraLines: string[]
): string {
  const decoded = Buffer.from(encodedContent, "base64").toString("utf-8");
  const lines = decoded.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const result = [...lines, ...extraLines].join("\n");
  return Buffer.from(result, "utf-8").toString("base64");
}
