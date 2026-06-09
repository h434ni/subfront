# SubFront

A utility that automatically fetches a V2Ray subscription and rewrites `Address` domain names, acting as a new (modified) subscription.

## Installation

```bash
bun install
```


## Deploy to Server

a built-in cli program ([`index.ts`](./index.ts)) is used. read [cli docs](docs/cli.md) if you want to use it directly.

### Configuration

Create a `config.json` or copy and modify [`config.example.json`](./config.example.json)

```json
{
  "baseUrls": {
    "sub1/": "https://sub.original.com:1234/sub/",
    "sub2/": "https://sub.original2.com:1235/sub/"
  },
  "mapping": {
    "org-host1.com": "new-host.com",
    "org-host2.com": "new-host2.com",
    "org-host3.com": "new-host.com"
  }
}


```

Requests are routed by prefix:

- `/sub1/abcdef` → `https://sub.original.com:1234/sub/abcdef`
- `/sub2/xyz` → `https://sub.original2.com:1235/sub/xyz`

If the request path does not match any configured prefix, the server returns a `404` response listing the valid prefixes.

For a single base URL, `baseUrl` also works:

```json
{
  "baseUrl": "https://sub.original.com/1234/sub/",
  ...
}
```

#### Environment variables

- `PORT` - Server port (default: 3000)
- `CONFIG_PATH` - Path to config.json containing `baseUrl` and `mapping` (default: ./config.json)
- `DEBUG` - Enable detailed logging (true/false or 1/0, default: false)

### Running the Server

```bash
bun run start
```

### Test

```bash
curl https://new-server.com/sub1/abcde123
```

All domains listed in `config.json` will be automatically replaced in the subscription content.

## How it Works

1. Client requests: `https://new-server.com/sub1/abcde123`
2. Server finds the matching prefix in `config.json` and fetches from the mapped base URL
3. Server decodes the subscription content
4. Server applies domain replacements from `config.json`
5. Server re-encodes to base64 and returns the modified subscription
