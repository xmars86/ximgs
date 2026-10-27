# Security Policy

## Supported versions

Security fixes are applied to the current desktop release line (`0.3.x` and newer). Older builds may not receive patches.

## What to report

Please report in private if you find:

- Credential or secret leakage (storage keys, tokens, private keys)
- Path traversal / arbitrary file read-write outside intended folders
- IPC / renderer privilege issues that can escape the desktop sandbox
- Dependency vulnerabilities with a realistic exploit path in this app

## What not to report here

- Cloud provider outages, billing, or bucket misconfiguration
- Feature requests and UX bugs (use GitHub Issues)
- Issues that require the attacker to already have local admin on the machine

## How to report

1. Prefer a **private** channel: open a GitHub Security Advisory on this repository if available, or email the author address shown in **Settings → About** inside the app.
2. Include: affected version, OS, steps to reproduce, impact, and (if possible) a minimal PoC **without** real production secrets.
3. Allow reasonable time for a fix before public disclosure.

## Safe handling reminders for operators

- Never commit `.env`, `.env.local`, `*.pem`, `*.key`, or `license-server` / `key-generator` private material.
- Storage secrets stay in OS `safeStorage` on the local machine; do not paste them into Issues or chat logs.
- Rotate cloud keys immediately if they may have been exposed.
