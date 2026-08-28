# Security Policy

## Supported versions

aparté is pre-1.0. Only the **latest released version** of the `@aparte/*` packages
receives security fixes — every package ships in lockstep, so upgrading one number
upgrades the set.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private vulnerability reporting:
**https://github.com/apartejs/aparte/security/advisories/new**
(Repository → Security → Report a vulnerability.)

You should get a first response within a few days. Please include a minimal
reproduction — a snippet that drives `@aparte/core` (or the affected package) and the
payload involved.

## Scope notes for researchers

- `@aparte/core` renders **LLM-authored content** into the light DOM. Markdown and
  highlighter output passes through a built-in allowlist sanitizer
  (`packages/core/src/config/sanitize.ts`); anything that bypasses it — or any
  unescaped interpolation in a built-in renderer — is in scope and very welcome.
- `setHtmlSanitizer(null)` deliberately disables sanitization and warns; reports that
  require it are out of scope.
- `createAparteChatHandler` (the server-side `/api/chat` helper) requires an
  `authorize` callback by type; SSRF/key-leak reports against it are in scope.
- The artifact **preview** runs in a sandboxed iframe with an opaque origin; escapes
  from that sandbox are in scope.

## Disclosure

Coordinated disclosure preferred. Fixes ship as a patch release across all packages
with the advisory credited in the changelog (unless you prefer anonymity).
