# Security Policy

## Supported versions

aparté is at 1.x. Only the **latest 1.x release** of the `@aparte/*` packages receives security
fixes — every package ships in lockstep, so upgrading one number upgrades the set. The 0.x
releases receive none: [Upgrading to 1.0](https://apartejs.dev/guides/upgrading/) lists what to
change.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private vulnerability reporting:
**https://github.com/apartejs/aparte/security/advisories/new**
(Repository → Security → Report a vulnerability.)

You will get a first response within **7 days**. A confirmed vulnerability is fixed in a release
within **30 days**, sooner when it is severe; when a fix needs longer, the advisory says why and
what to do in the meantime. Please include a minimal reproduction — a snippet that drives
`@aparte/core` (or the affected package) and the payload involved.

## Scope notes for researchers

- `@aparte/core` renders **LLM-authored content** into the light DOM. Markdown and
  highlighter output passes through a built-in allowlist sanitizer
  (`packages/core/src/config/sanitize.ts`); anything that bypasses it — or any
  unescaped interpolation in a built-in renderer — is in scope and very welcome.
- A picture a model or a tool chose loads only as the image policy allows
  (`setImagePolicy`, `packages/core/src/config/image-policy.ts`): a way to make one the
  policy holds send its request — before the reader's click, or to another address — is in
  scope.
- `setHtmlSanitizer(null)` deliberately disables sanitization and warns; reports that
  require it are out of scope.
- `createAparteChatHandler` (the server-side `/api/chat` helper) requires an
  `authorize` callback by type; SSRF/key-leak reports against it are in scope.
- The artifact **preview** runs in a sandboxed iframe with an opaque origin; escapes
  from that sandbox are in scope.

## Disclosure

Coordinated disclosure preferred. A fix ships as a release of every package, usually a patch,
with the advisory credited in the changelog (unless you prefer anonymity).
