---
'@aparte/plugin-subagents': patch
---

After a reload, the call that opened a sub-agent reads as working again once the sub-agent's question is answered, instead of staying "awaiting approval".

While a sub-agent asks, the plugin marks the call that opened it as waiting and gives it back its progress once the question is answered. A lane taken up after a reload did not know the mark was its own, and left it.
