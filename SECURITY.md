# Security Policy

## Secret handling

The core Words application does not require an external API key. Do not add real credentials, API keys, access tokens, private keys, service-account JSON, or production `.env` / `.dev.vars` files to this repository.

If a future feature needs a third-party API:

- keep the credential on the server side only;
- on Cloudflare Pages, store it in the project's encrypted environment/secrets configuration;
- read it only inside a Pages Function through `context.env`;
- never embed the credential in `app.js`, HTML, CSS, the service worker, shared-deck URLs, or other browser-delivered assets;
- never expose a secret using public-client environment prefixes such as `VITE_*`, `NEXT_PUBLIC_*`, or similar mechanisms;
- keep local development secrets in `.dev.vars` or another ignored local file, never in a committed example file.

The repository `.gitignore` excludes common secret-bearing files. CI also runs `npm run security:check`, which rejects known credential signatures and secret-bearing file types.

## Cloud sync

Words encrypts cloud-sync data in the browser with AES-GCM before upload. The sync passphrase is not stored in application data and is not sent to the server. A separate opaque lookup key is derived from the sync code and passphrase before the request reaches the sync endpoint.

The server-side D1 binding (`WORDS_DB`) is a Cloudflare binding, not a credential that should be embedded in client code. Any Cloudflare account/API token used for deployment must be stored in the deployment platform or GitHub Actions Secrets, never committed to the repository.

## If a secret is committed accidentally

Treat a committed secret as compromised even if it was removed in a later commit.

1. Revoke or rotate the credential immediately.
2. Remove the secret from Git history, not only from the latest file version.
3. Replace affected deployment credentials and verify provider audit logs when available.
4. Re-run `npm run security:check` and CI before deployment.

## Security limitations

The repository secret scanner is defense in depth and cannot recognize every possible credential format. Provider-side secret scanning / push protection should also be enabled in GitHub repository settings when available.
