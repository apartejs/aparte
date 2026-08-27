---
'@aparte-workspace/docs': patch
---

`pnpm release` no longer re-runs the full gate; it requires CI to have passed on the exact
commit instead.

Publishing validated one commit three times: the version PR's CI, `main`'s CI after the
merge, and `gate:full` again inside `release` — roughly twenty minutes of a maintainer's
wall clock proving what GitHub had just proved. `prerelease-checks` gained a fourth check
that asks for the `ci` verdict on `HEAD`'s SHA and refuses when it is red, still running,
or absent; a missing or unauthenticated `gh` refuses too, rather than waving the release
through.

This is stricter than what it replaced, not looser. The old gate ran on a maintainer's
workstation; CI runs on `ubuntu-latest`, where 0.13.0's POSIX path bug was reachable and a
Windows gate could never see it. And 0.13.0 was itself published at 22:52 from a commit
whose CI concluded `failure` at 22:58 — the local gate was green, nothing was watching the
one that mattered, and the new check would have stopped it twice over.
