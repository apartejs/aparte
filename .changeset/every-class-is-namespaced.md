---
'@aparte/core': minor
---

**Every CSS class core emits is now prefixed `aparte-`.** Breaking, pre-1.0, no aliases: 42 names across 291 occurrences.

`aparte-segment` `aparte-segment-content` `aparte-segment-text` `aparte-segment-thinking` `aparte-segment-code` `aparte-segment-error` `aparte-segment-tool-call` `aparte-segment-artifact-card` `aparte-segment-artifact-file` `aparte-segment-pipeline-waiting` `aparte-segment-unknown` · `aparte-tool-summary` `aparte-tool-toggle` `aparte-tool-label` `aparte-tool-icon` `aparte-tool-name` `aparte-tool-spinner` `aparte-tool-state` `aparte-tool-detail` `aparte-tool-part` `aparte-tool-part-label` `aparte-tool-part-body` · `aparte-code-content-wrapper` `aparte-code-copy` `aparte-code-filename` `aparte-code-header` `aparte-code-header-filler` `aparte-code-language` · `aparte-error-content` `aparte-error-details` `aparte-error-icon-wrapper` `aparte-error-message` `aparte-error-title` · `aparte-thinking-content` `aparte-thinking-header` `aparte-thinking-label` `aparte-thinking-toggle` · `aparte-is-streaming` `aparte-is-focused` `aparte-is-dragover` `aparte-has-content` · `aparte-pw-dot`

If you style any of these, add the prefix. `--aparte-*` custom properties are unchanged — they were already namespaced.

**Why it mattered in both directions.** Core is light DOM on purpose: no shadow root, so every selector reaches in and out. Inbound has bitten this project twice already — a bare `nav { justify-content: space-between }` on aparté's own docs site pushed the artifact card's tabs to opposite ends, and `.segment` is Semantic UI's base layout class. Outbound is the worse half and was never stated: these were **bare global selectors**, so `@aparte/core` shipped a rule for `.error-message`, `.code-header` and `.thinking-header` onto the whole page. Almost every site has an `.error-message`.

The component classes were already prefixed (`aparte-message`, `aparte-composer-row`, `aparte-approval-option`, `aparte-elic-panel`); the renderer classes never were. With no written policy, the split held at 146 to 42. The policy is now in CLAUDE.md.

One deliberate exception: `language-*` on a code block stays unprefixed, because that is the class name highlighters look for.

Removing the `progress` segment in the same release already took out `progress-bar` and `progress-fill`, which are Bootstrap's.
