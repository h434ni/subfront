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

Requests are routed by prefix:

- `/sub1/abcdef` → `https://sub.original.com:1234/sub/abcdef`
- `/sub2/xyz` → `https://sub.original2.com:1235/sub/xyz`

If the request path does not match any configured prefix, the server returns a `404` response listing the valid prefixes.

For a single base URL, `baseUrl` works too:

```json
{
  "baseUrl": "https://sub.original.com/1234/sub/",
  ...
}
```
#### Settings

default settings work out of the box but you can modify them.

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

- `appendExpiration` - append an extra config line that contains expiration info
- `appendUsage` - append an extra config line that contains usage info
- `useProxyForBaseUrl` - fetch every configured base subscription URL request through `proxy` when set to `true`; when `false`, base subscription and appended stats requests bypass proxy env vars too (default: `false`)
- `proxy` - HTTP proxy to use when `useProxyForBaseUrl` is enabled (optional)

#### Environment variables

- `PORT` - Server port (default: 3000)
- `CONFIG_PATH` - Path to config.json containing `baseUrl` and `mapping` (default: ./config.json)
- `DEBUG` - Enable detailed logging (true/false or 1/0, default: false)

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
3. Server decodes the subscription content
4. Server applies domain replacements from `config.json`
5. Server re-encodes to base64 and returns the modified subscription

## Note
the core ([`index.ts`](./index.ts)) can also be used as a standalone script. [cli docs](docs/cli.md)
