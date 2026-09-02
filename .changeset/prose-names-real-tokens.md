---
"@aparte/core": patch
---

The `<aparte-chat-status>` caveat names the tokens the sheet actually reassigns (`--aparte-message-padding-block` / `-inline`); the theming guide and the landing page stop offering two variables 0.16.8 removed.

`--aparte-message-padding` was split into `-block` / `-inline` and `--aparte-avatar-radius` became `--aparte-avatar-radius-ratio` (a fraction of `--aparte-avatar-size`, not a length — the guide now says so, because swapping the name and passing `6px` is the natural next mistake). Both kept being offered: in the theming guide's grouped token list, in the status element's own JSDoc — which the generated component page reprints — and, for the avatar one, in the landing page's three-line "one instance, three variables" snippet, the page whose whole job is to make the theming promise credible.

A name that does not exist fails in silence: the declaration is invalid at computed-value time, the property inherits, and the page looks almost right. That is the exact failure the same guide has a section warning about, so the pages taught the mistake they teach you to avoid. `check:derived-vars` now reads variable names out of that prose — the two pages plus every JSDoc block in core's and the plugins' source — and refuses one the library cannot answer to; a family prefix (`--aparte-code-*`) and a line marked `undeclared-on-purpose` are the two exceptions, the second for the guide's own worked example of a name core does not declare.
