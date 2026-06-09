import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function fetchSubscription(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch (error) {
    return null;
  }
}

function extractDomain(hostname: string): {
  subdomain: string;
  domain: string;
} {
  const parts = hostname.split(".");

  if (parts.length >= 2) {
    const domain = parts.slice(-2).join(".");
    const subdomain = parts.slice(0, -2).join(".");
    return { subdomain, domain };
  }

  return { subdomain: "", domain: hostname };
}

function replaceSubscriptionHost(line: string, newHost: string): string {
  try {
    const url = new URL(line);
    url.hostname = newHost;
    return url.toString();
  } catch {
    return line;
  }
}

function changeSubscriptionDomains(
  encodedContent: string,
  replacement: Record<string, string> | string
): string {
  // Decode base64
  const decoded = Buffer.from(encodedContent, "base64").toString("utf-8");

  // Split by lines and normalize CRLF endings
  const lines = decoded.split(/\r?\n/);

  const modifiedLines = lines
    .map((line) => {
      if (!line.trim()) return line;

      let modifiedLine = line;

      if (typeof replacement === "string") {
        return replaceSubscriptionHost(modifiedLine, replacement);
      }

      for (const [sourceHost, targetHost] of Object.entries(replacement)) {
        // Replace the source host with the target host in URLs
        modifiedLine = modifiedLine.replace(
          new RegExp(`@${sourceHost}([:/?#]|$)`, "g"),
          `@${targetHost}$1`
        );
        // Also replace in query parameters like host=sourceHost
        modifiedLine = modifiedLine.replace(
          new RegExp(`([?&]host=)${sourceHost}([&]|$)`, "g"),
          `$1${targetHost}$2`
        );
      }
      return modifiedLine;
    })
    .filter((line) => line.trim().length > 0);

  // Join back and encode to base64
  const modified = modifiedLines.join("\n");
  const encoded = Buffer.from(modified, "utf-8").toString("base64");

  return encoded;
}

export { fetchSubscription, changeSubscriptionDomains };

async function main() {
  const args = process.argv.slice(2);

  // Command line mode
  if (args.length >= 2) {
    const subscriptionUrl = args[0]!;
    const newDomain = args[1]!;

    // Extract old hostname
    let oldHost: string;
    try {
      oldHost = new URL(subscriptionUrl).hostname;
    } catch {
      console.log("❌ Invalid subscription URL");
      process.exit(1);
    }

    // Fetch subscription
    const encodedContent = await fetchSubscription(subscriptionUrl);
    if (!encodedContent) {
      console.log("❌ Failed to fetch subscription");
      process.exit(1);
    }

    // Change the host in subscription URIs only
    const newEncodedContent = changeSubscriptionDomains(
      encodedContent,
      newDomain
    );

    console.log(newEncodedContent);
    process.exit(0);
  }

  // Interactive mode
  console.log("📡 SubChanger - Subscription Domain Replacer\n");

  const subscriptionUrl = await question(
    "Enter your subscription link: "
  );

  if (!subscriptionUrl.trim()) {
    console.log("❌ No link provided.");
    rl.close();
    return;
  }

  let oldHost: string;
  try {
    oldHost = new URL(subscriptionUrl).hostname;
  } catch {
    console.log("❌ Invalid subscription URL");
    rl.close();
    return;
  }

  console.log("\n🔄 Fetching subscription...");
  const encodedContent = await fetchSubscription(subscriptionUrl);

  if (!encodedContent) {
    console.log("❌ Failed to fetch subscription");
    rl.close();
    return;
  }

  // Decode and show preview
  const decoded = Buffer.from(encodedContent, "base64").toString("utf-8");
  const proxyCount = decoded.split("\n").filter((line) => line.trim()).length;

  console.log(`✅ Fetched successfully`);
  console.log(`   Found ${proxyCount} proxy config(s)`);
  console.log(`   Current host: ${oldHost}\n`);

  const newDomain = await question("Enter the new domain: ");

  if (!newDomain.trim()) {
    console.log("❌ No new domain provided.");
    rl.close();
    return;
  }

  const newEncodedContent = changeSubscriptionDomains(
    encodedContent,
    newDomain
  );

  console.log(`\n✅ Host changed: ${oldHost} → ${newDomain}`);
  console.log(`\n📋 New subscription:\n`);
  console.log(newEncodedContent);

  rl.close();
}

if (import.meta.main) {
  main();
}