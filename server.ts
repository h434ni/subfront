import { changeSubscriptionDomains } from "./index.ts";
import {
  getSubscriptionStats,
  buildCustomSubscriptionConfigs,
  appendConfigsToEncodedSubscription,
  normalizeProxyUrl,
} from "./utils/subscription.ts";

function parseDotEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.substring(0, separatorIndex).trim();
    let value = trimmed.substring(separatorIndex + 1).trim();

    if (value.startsWith("\"") && value.endsWith("\"")) {
      value = value.slice(1, -1);
    }
    if (value.startsWith("'" ) && value.endsWith("'")) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

async function loadEnv(): Promise<Record<string, string>> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }

  try {
    if (await Bun.file(".env").exists()) {
      const text = await Bun.file(".env").text();
      Object.assign(env, parseDotEnv(text));
    }
  } catch {
    // ignore missing .env
  }

  return env;
}

const env = await loadEnv();
const PORT = Number(env["PORT"] ?? "3000");
const DEBUG = /^(true|1|yes|on)$/i.test(env["DEBUG"] ?? env["debug"] ?? "");
const CONFIG_PATH = env["CONFIG_PATH"] ?? "./config.json";

type SubChangerConfig = {
  baseUrl?: string;
  baseUrls?: Record<string, string>;
  mapping: Record<string, string>;
  settings?: {
    appendExpiration?: boolean;
    appendUsage?: boolean;
    proxy?: string;
    useProxyForBaseUrl?: boolean;
  };
};

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.replace(/^\/+|\/+$/g, "");
  return trimmed ? `${trimmed}/` : "";
}

function buildBaseUrlMap(config: SubChangerConfig): Record<string, string> {
  const baseUrls = config.baseUrls ?? {};
  if (Object.keys(baseUrls).length > 0) {
    return Object.fromEntries(
      Object.entries(baseUrls).map(([prefix, url]) => [normalizePrefix(prefix), url])
    );
  }

  if (config.baseUrl) {
    return { "": config.baseUrl };
  }

  throw new Error(`Config file must contain either baseUrl or baseUrls: ${CONFIG_PATH}`);
}

function validateBaseUrls(baseUrls: Record<string, string>) {
  for (const [prefix, url] of Object.entries(baseUrls)) {
    try {
      new URL(url);
    } catch (error) {
      throw new Error(
        `Invalid base URL defined for prefix "${prefix}" in ${CONFIG_PATH}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

async function loadConfig(): Promise<SubChangerConfig> {
  try {
    if (await Bun.file(CONFIG_PATH).exists()) {
      const text = await Bun.file(CONFIG_PATH).text();
      return JSON.parse(text) as SubChangerConfig;
    }
  } catch (error) {
    logError(null, "Failed to load config.json", {
      error: error instanceof Error ? error.message : String(error),
      path: CONFIG_PATH,
    });
  }
  throw new Error(`Config file not found or invalid: ${CONFIG_PATH}`);
}

const config = await loadConfig();
const baseUrlMap = buildBaseUrlMap(config);
validateBaseUrls(baseUrlMap);
const baseUrlEntries = Object.entries(baseUrlMap).sort((a, b) => b[0].length - a[0].length);
const configuredPrefixesDisplay = baseUrlEntries
  .map(([prefix]) => (prefix ? `/${prefix}` : "/"))
  .join(", ");

const domainMapping = config.mapping;
const configuredProxy = normalizeProxyUrl(config.settings?.proxy);
const useProxyForBaseUrl = config.settings?.useProxyForBaseUrl ?? false;
if (!useProxyForBaseUrl) {
  process.env.NO_PROXY = "*";
  process.env.no_proxy = "*";
}

if (!domainMapping || Object.keys(domainMapping).length === 0) {
  throw new Error(`No domain mappings found in config file: ${CONFIG_PATH}`);
}

let requestCounter = 0;

process.on("unhandledRejection", (reason) => {
  logError(null, "Unhandled promise rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on("uncaughtException", (error) => {
  logError(null, "Uncaught exception", {
    error: error instanceof Error ? error.message : String(error),
  });
});

function logInfo(requestId: number | null, message: string, meta?: Record<string, string | number>) {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString();
  const prefix = requestId !== null ? `[${timestamp}] [req:${requestId}]` : `[${timestamp}]`;
  const metaString = meta
    ? Object.entries(meta)
        .map(([key, value]) => `${key}=${value}`)
        .join(" ")
    : "";
  console.log(`${prefix} INFO ${message}${metaString ? ` ${metaString}` : ""}`);
}

function logError(requestId: number | null, message: string, meta?: Record<string, string | number>) {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString();
  const prefix = requestId !== null ? `[${timestamp}] [req:${requestId}]` : `[${timestamp}]`;
  const metaString = meta
    ? Object.entries(meta)
        .map(([key, value]) => `${key}=${value}`)
        .join(" ")
    : "";
  console.error(`${prefix} ERROR ${message}${metaString ? ` ${metaString}` : ""}`);
}

function getTargetHost(request: Request): string | null {
  const rawHost = request.headers.get("host");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const originalHost = request.headers.get("x-original-host");

  const normalizeHost = (hostValue: string | null): string | null => {
    if (!hostValue) return null;
    const firstPart = hostValue.split(",")[0];
    const [host = ""] = firstPart?.trim().split(":") ?? [""];
    return host.trim() || null;
  };

  const hostHeader = normalizeHost(rawHost);
  const forwarded = normalizeHost(forwardedHost) ?? normalizeHost(originalHost);

  if (hostHeader && hostHeader !== "127.0.0.1" && hostHeader !== "localhost") {
    return hostHeader;
  }

  return forwarded ?? hostHeader;
}

function getSubscriptionUrlForRequest(request: Request): string | null {
  try {
    const requestUrl = new URL(request.url);
    const requestPath = requestUrl.pathname.replace(/^\/+/, "");

    for (const [prefix, baseUrl] of baseUrlEntries) {
      const matchesPrefix =
        prefix === "" ||
        requestPath === prefix.slice(0, -1) ||
        requestPath.startsWith(prefix);

      if (!matchesPrefix) continue;

      const suffix = prefix === "" ? requestPath : requestPath.slice(prefix.length);
      const targetUrl = new URL(baseUrl);
      const basePath = targetUrl.pathname.endsWith("/")
        ? targetUrl.pathname
        : `${targetUrl.pathname}/`;
      targetUrl.pathname = suffix ? `${basePath}${suffix}` : basePath;
      targetUrl.search = "";
      return targetUrl.toString();
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchSubscriptionWithDiagnostics(
  url: string,
  requestId: number,
  options: { proxy?: string } = {}
): Promise<string | null> {
  const start = Date.now();
  try {
    const response = await fetch(
      url,
      options.proxy ? { proxy: options.proxy } : undefined
    );
    const durationMs = Date.now() - start;
    const contentType = response.headers.get("content-type") ?? "unknown";
    const contentLength = response.headers.get("content-length") ?? "unknown";

    if (!response.ok) {
      const bodySnippet = await response.text().then((body) => body.slice(0, 512));
      logError(requestId, "Base subscription fetch failed", {
        status: response.status,
        statusText: response.statusText,
        durationMs,
        contentType,
        contentLength,
        bodySnippet,
      });
      return null;
    }

    const text = await response.text();
    logInfo(requestId, "Fetched base subscription successfully", {
      status: response.status,
      durationMs,
      contentType,
      contentLength: text.length,
      proxyUsed: options.proxy ? "yes" : "no",
    });
    return text;
  } catch (error) {
    const durationMs = Date.now() - start;
    logError(requestId, "Error fetching base subscription", {
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    });
    return null;
  }
}

Bun.serve({
  port: PORT,
  async fetch(request: Request) {
    const requestId = ++requestCounter;
    const requestUrl = new URL(request.url);
    const requestPath = requestUrl.pathname;
    const requestHostHeader = request.headers.get("host") ?? "unknown";
    const requestForwardedHost = request.headers.get("x-forwarded-host") ?? "";
    const requestOriginalHost = request.headers.get("x-original-host") ?? "";

    logInfo(requestId, "Incoming request", {
      method: request.method,
      path: requestPath,
      host: requestHostHeader,
      xForwardedHost: requestForwardedHost,
      xOriginalHost: requestOriginalHost,
    });

    if (request.method !== "GET") {
      logError(requestId, "Rejected non-GET request", { method: request.method });
      return new Response("Method Not Allowed", { status: 405 });
    }

    const targetSubscriptionUrl = getSubscriptionUrlForRequest(request);
    if (!targetSubscriptionUrl) {
      logError(requestId, "No matching configured subscription prefix", {
        path: requestPath,
        configuredPrefixes: configuredPrefixesDisplay,
      });
      return new Response(
        `No configured prefix matched request path. Valid prefixes: ${configuredPrefixesDisplay}`,
        { status: 404 }
      );
    }

    logInfo(requestId, "Resolved subscription URL", { targetSubscriptionUrl });

    const encodedContent = await fetchSubscriptionWithDiagnostics(
      targetSubscriptionUrl,
      requestId,
      {
        proxy: useProxyForBaseUrl ? configuredProxy : undefined,
      }
    );
    if (!encodedContent) {
      logError(requestId, "Failed to fetch base subscription");
      return new Response("Failed to fetch base subscription", { status: 502 });
    }

    let replaced: string;
    try {
      replaced = changeSubscriptionDomains(encodedContent, domainMapping);
    } catch (error) {
      logError(requestId, "Subscription rewrite failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return new Response("Subscription rewrite failed", { status: 500 });
    }

    let finalPayload = replaced;
    const appendExpiration = config.settings?.appendExpiration ?? false;
    const appendUsage = config.settings?.appendUsage ?? false;

    if (appendExpiration || appendUsage) {
      try {
        const stats = getSubscriptionStats(targetSubscriptionUrl, {
          proxy: useProxyForBaseUrl ? configuredProxy : undefined,
        });
        const extraConfigs = buildCustomSubscriptionConfigs(stats, {
          appendExpiration,
          appendUsage,
        });
        if (extraConfigs.length > 0) {
          finalPayload = appendConfigsToEncodedSubscription(replaced, extraConfigs);
        }
      } catch (error) {
        logInfo(requestId, "Skipped extra config generation", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logInfo(requestId, "Subscription rewritten", {
      mappingsApplied: Object.keys(domainMapping).length,
      encodedLength: finalPayload.length,
    });

    return new Response(finalPayload, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Request-Id": String(requestId),
      },
    });
  },
});

logInfo(null, "Server running", {
  port: PORT,
  baseSubscriptionUrls: Object.values(baseUrlMap).join(", "),
  configuredPrefixes: Object.keys(baseUrlMap).join(", "),
  configFile: CONFIG_PATH,
  domainMappings: Object.keys(domainMapping).length,
});
