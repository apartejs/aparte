---
"@aparte/core": patch
---

An elicitation's question no longer runs under the corner "Skip" button (#50).

The button is absolutely positioned, so nothing in the flow reserved its width: any
message long enough to reach the panel's edge printed its first line underneath it —
measured at 43px of text under "Skip" in a 460px panel. `.aparte-elic-message` now
keeps the same room the tab rail already reserves, from the same token
(`--aparte-elic-dismiss-room`), so the two can never disagree — and a locale whose
word is wider than "Skip" bumps one value instead of patching two rules.
