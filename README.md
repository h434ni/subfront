# SubFront

fetch a V2Ray subscription and rewrite domain names, acting as a new (and modified) subscription.

## Installation

Requirements: [bun](https://bun.sh/), `curl`, `node`

```bash
git clone https://github.com/h434ni/subfront.git
bun install
```
## Deployment

### Configuration

```bash
cp config.example.json config.json
```

Requests are routed by prefix. example:
1. `/sub1/abcdef` → `https://sub.original.com:1234/sub/abcdef`
2. `/sub2/xyz` → `https://sub.original2.com:1235/sub/xyz`

For a single base URL, `baseUrl` works too:

```json
{
  "baseUrl": "https://sub.original.com/1234/sub/",
  ...
}
```
#### Settings

you can modify the default values

```json
{
  ...
  "settings": {
    "appendExpiration": true,
    "appendUsage": true,
    "useProxyForBaseUrl": false,
    "proxy": "127.0.0.1:10808"
  }
}
```

- `appendExpiration` - an extra config that contains expiration info
- `appendUsage` - an extra config that contains usage info
- `useProxyForBaseUrl` - fetch base URL through `proxy`. when `false` requests directly, ignoring proxies, including env vars
- `proxy` - HTTP proxy to be used when `useProxyForBaseUrl` is enabled

#### Environment variables

- `PORT` - Server port (default: 3000)
- `CONFIG_PATH` - default: ./config.json
- `DEBUG` - detailed logging

### Running the Server

```bash
bun start
```

### Test

```bash
curl https://new-server.com/sub1/abcde123
```

## How it Works

1. Client requests: `https://new-server.com/sub1/abcde123`
2. Server finds the matching prefix in `config.json` and fetches from the mapped base URL
3. decodes the subscription content
4. applies domain replacements from `config.json`
5. re-encodes to base64 and returns the modified subscription

## Notes
- If the requested path does not match any configured prefix, the server returns a `404` response listing the valid prefixes.
- the core ([`index.ts`](./index.ts)) can also be used as a standalone script. [cli docs](docs/cli.md)
