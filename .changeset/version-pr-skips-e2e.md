---
'@aparte-workspace/docs': patch
---

A Version PR no longer runs the browser suite.

0.13.0's was 113 files and not one of them was source — package versions, CHANGELOGs, and
the changesets they consumed — and it still ran a build and 370 browser tests across seven
example apps to prove that a version number does not break a chat. The release paid that
twice: once on the PR, once on `main` after the merge.

The `e2e` job still runs and still reports, because it is a required check in main's
ruleset and a skipped job never reports at all — that would block every release PR
forever. Only the install, the build and the suite are conditional. The rule is
"does this diff touch anything a browser could notice": everything except `.changeset/*`,
`CHANGELOG.md`, and the version-and-peer-floor lines of a `package.json`; a manifest that
changes for a real reason still counts. It fails open — no base, a first push, an
unreadable diff, and the suite runs.
