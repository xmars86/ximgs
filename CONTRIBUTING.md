# Contributing

Thank you for your interest in xImgs.

## Before you start

- This repository is **source-available**, not OSI open source. See [LICENSE](LICENSE).
- Do not open PRs that include secrets, private keys, `.env` files, `license-server/`, or `key-generator/`.
- Prefer small, focused changes with a clear product or bugfix.

## Development setup

Requirements: Node.js `>= 20.19`, **pnpm** only.

```bash
corepack enable
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm typecheck
pnpm test
```

## Pull requests

1. Describe the user-facing impact in 1–3 sentences.
2. Note any IPC / DB migration changes.
3. Confirm you did not commit local env files or binaries under `release/` / `out/`.

Security-sensitive findings: follow [SECURITY.md](SECURITY.md) instead of a public PR when appropriate.

## Support

Product questions and feature ideas: GitHub Issues.  
Business / licensing: in-app **Settings → About**.
