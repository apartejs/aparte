---
'@aparte/provider-scenario': minor
---

The showcase answers two more requests: ask it for maths, or for a diagram.

`math` replies with inline and display formulas and a sentence of prices that must stay text; `diagram` replies with a ```` ```mermaid ```` flowchart. With `@aparte/plugin-katex` and `@aparte/plugin-mermaid` installed they are drawn; without, they show as TeX and as code. Both come before `code`, whose `when` would otherwise take "a maths example".
