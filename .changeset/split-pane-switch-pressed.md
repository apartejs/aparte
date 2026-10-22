---
'@aparte/core': patch
---

The buttons that switch a stacked `<aparte-split>` (`data-aparte-split-pane="start"` / `"end"`) now carry `aria-pressed`, true on the one for the pane in view, so a screen reader hears which pane is shown.

A toggle (an id, or an empty value) is an action and gets no pressed state. The split stamps the controls when it connects and on every pane change.
