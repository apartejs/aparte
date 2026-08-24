---
---

Site analytics on apartejs.dev — a self-hosted, cookieless Umami on every page. Touches
`apps/docs` and `nginx.docs.conf` only.

Deliberately EMPTY, because nothing publishable moved: `apps/docs` is private and never
leaves the repo, and the nginx config ships inside the docs image, so no `@aparte/*`
package changes behaviour, API or CSS. It exists because `apps/docs` is private *and
versioned* — changesets counts it as a changed package, so the CI guard asks this PR for
a changeset, and "no release" is the answer rather than an excuse to skip the guard.
