# CLI guide

[`index.ts`](../index.ts) (the tool) gets called by [`server.ts`](../server.ts) but you can also use it directly if you want.
## Usage

```bash
# Command line Mode
bun index.ts "<subscription_url>" "<new_domain>"

# e.x. to decode and preview the result
bun index.ts "https://sub.original.com:1234/sub/abcdef123456" "new.example" | base64 -d

# Interactive Mode
bun index.ts
```

Output: A base64-encoded subscription with all domains replaced from the source subscription host to `new.example`


## How it Works

1. Extracts the main domain from the subscription URL (last 2 parts: e.g., `source.example`)
2. Fetches the subscription content
3. Base64 decodes it
4. Finds all occurrences of the source domain (including subdomains like `p.source.example`)
5. Replaces them with the new domain while preserving subdomains
6. Base64 encodes the result
7. Returns the modified subscription