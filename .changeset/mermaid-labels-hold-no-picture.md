---
'@aparte/plugin-mermaid': patch
---

A diagram's labels can no longer load a picture: Mermaid's sanitizer now refuses pictures, players, frames and styles in every label it writes as HTML, and a diagram's `%%{init}%%` cannot lift that.

An architecture service's icon text is written as HTML even with HTML labels off, and Mermaid draws in the page to measure a diagram before the plugin turns it into an image, so `service s1 "<img src=https://…>"` fetched that address with no click. The rule goes through Mermaid's own `dompurifyConfig`, which covers every such label rather than the one diagram type.
