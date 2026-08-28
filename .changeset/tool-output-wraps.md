---
"@aparte/core": patch
---

A tool call's input and result now wrap inside the bubble instead of running past its edge. A one-line result — an error message, a long path — was 1 823px of text in a 723px body (407px on a phone): the `<pre>` kept its default `white-space: pre`, so the whole disclosure was clipped at the message's edge. It gets the same pair the code block already had, `white-space: pre-wrap` + `overflow-wrap: anywhere`; a stylesheet that targeted `.aparte-tool-part-body pre` keeps working, the rule only moved from `prose.css` to the tool-call segment's own sheet.
