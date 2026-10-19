# Blocksmith Paste

Public fork: https://github.com/blocksmithstudio/wastebin

Based on Wastebin 3.9.0 plus upstream fixes at `c798c5a`. The original MIT license
and notices remain. Wastebin's layouts and themes are preserved; the editor header
and configured page title identify Blocksmith.

## Automatic syntax detection

The browser sends the first 16,384 characters of the text to a local Web Worker. A bundled,
pinned Highlight.js build guesses common code/config languages. No text goes to
an outside service. Valid JSON is recognized directly, and a Java package/class
signature resolves a common Java/C#/TypeScript tie. Low scores and ambiguous
results fall back to plain text. Detection is best-effort, especially for short
snippets and mixed server logs.

Auto-detect is selected initially. Users can choose any supported language or
plain text instead; manual choices always win. Opening a file uses its extension
when recognized, otherwise its content is detected. Saving waits for the latest
detection, including Ctrl+S and Ctrl+Enter. If the worker fails or takes longer
than two seconds, saving continues as plain text. Without JavaScript, manual
language selection and saving still work.

The selected extension is submitted with the original text and rendered using
Wastebin's existing Syntect themes. The JSON API is unchanged: API callers supply
`extension` themselves. Password-protected pastes still use Wastebin's server-side
encryption; this change does not add end-to-end encryption.

## Development

Use Node.js 24+ and Rust 1.95. All dependencies/build outputs belong in this checkout.

```sh
npm ci --ignore-scripts
npm test
npm run build
cargo fmt --all -- --check
cargo test --workspace --locked -j 1
cargo build --release --locked --bin wastebin --bin wastebin-ctl -j 1
```

The generated `crates/wastebin_server/src/javascript/detect-worker.js` is committed
so a Rust-only build also works. Rebuild it whenever the detector or its dependencies
change. Third-party license text is retained in that file.

Browser verification against a disposable/local database:

```sh
PASTE_BASE_URL=http://127.0.0.1:8088 node frontend/browser.test.js
```

Set `CHROMIUM_PATH` to reuse an installed Chromium; otherwise install Playwright's
Chromium using `npx playwright install chromium`. Screenshots and results default
to `.build/verification/`. The test creates synthetic pastes and deletes them.

## VPS deployment

Sources live in `deploy/`: systemd unit, Nginx configurations, environment example,
and an online SQLite backup helper. Deployment records live in
`/opt/blocksmith/projects/local/paste-deployment/README.md` on the VPS.

The service binds to `127.0.0.1:8088`, behind Nginx HTTPS. Nginx limits writes to
10/minute per address (burst 10), reads to 10/second (burst 40), and request bodies
to 2 MiB. UI pastes expire after seven days by default, with one-hour, one-day,
seven-day and 30-day choices. As upstream, API clients may omit expiration.
The application has no accounts or general web admin panel.

Do not commit live environment files, signing keys, password salts, or paste data.
