---
'@aparte/plugin-diff': patch
---

A diff line's two numbers are set further apart, so a line far down a file (`118 118`) no longer reads as one number. Nothing to change in your code.

Each number now keeps `--aparte-space-5` on both sides instead of `--aparte-space-2`: 20px between the old number and the new one with the default spacing, where it was 8px, about one character once a number filled the column's three-digit minimum. 20px is what a unified diff leaves between them (GitHub and GitLab). The gutter's selectors are documented under Customize, for an app that wants a rule between the two columns.
