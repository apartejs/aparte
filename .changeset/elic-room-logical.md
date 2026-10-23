---
'@aparte/core': patch
---

In a right-to-left page, a panel's question no longer runs under its corner buttons: the room kept for them is now on the inline end, where they sit.

The message and the tab rail reserved `--aparte-elic-dismiss-room` with a physical right margin while the corner sits at `inset-inline-end`, so in RTL the room was on the wrong side, and a question ran under its Skip.
