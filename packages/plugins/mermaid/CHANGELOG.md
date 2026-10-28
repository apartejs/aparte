# @aparte/plugin-mermaid

## 0.28.0

### Minor Changes

- 8c4cd8f: New package: `@aparte/plugin-mermaid` draws the ` ```mermaid ` fences a model writes as diagrams. Call `setupMermaid()`.

  It works with any Markdown provider, or none: every fence in a streamed reply is already a block of its own. The diagram is redrawn as its fence arrives, at most every 300 ms, keeping the last version that parsed; once the fence closes, one that does not parse shows a note and its source. Each diagram is an `<img>` of its SVG, so no script or style a model wrote into it can reach the page, and Mermaid runs with `securityLevel: 'strict'` and HTML labels off, which a diagram's own `%%{init}%%` cannot change. Colours follow the chat's theme. Mermaid is loaded on the first diagram, a diagram is drawn only once it comes near the screen, and `@aparte/plugin-mermaid/core` takes a Mermaid you hand it (`setupMermaidWith`).
