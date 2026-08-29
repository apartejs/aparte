---
"@aparte/core": minor
---

An approval option can carry a `description` — a second line drawn under its label, `string | (() => string)` like the label so it follows a live language switch — to say what choosing it commits to: `{ label: 'Always allow this command', description: 'git status' }` next to `{ label: 'Always allow any git command', description: 'git *' }`.

Issue #37: a host remembered the first word of a command while its button said only "Always allow", and the panel had nowhere to show the reach of that "always". A choice question's options already had `description`; the approval side now has the same, drawn with the same body (`.aparte-elic-option-title` / `.aparte-elic-option-desc`).
