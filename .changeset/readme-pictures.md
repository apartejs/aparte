---
'@aparte/plugin-katex': patch
'@aparte/plugin-mermaid': patch
'@aparte/plugin-echarts': patch
'@aparte/plugin-chartjs': patch
'@aparte/plugin-approval': patch
'@aparte/plugin-ask-user': patch
'@aparte/plugin-artifacts': patch
'@aparte/plugin-model-selector': patch
'@aparte/plugin-shiki': patch
'@aparte/plugin-compaction': patch
'@aparte/plugin-marked': patch
'@aparte/plugin-streaming-markdown': patch
'@aparte/react': patch
'@aparte/vue': patch
'@aparte/svelte': patch
'@aparte/angular': patch
---

The READMEs of the plugins and the framework packages now show a picture of what they draw. No code changes: nothing to do on your side.

Each plugin README that draws something (Markdown, maths, diagrams, both chart libraries, the approval modes, the question panel, artifacts, the model selector, code highlighting, compaction) shows its own demo, taken from the live docs (`https://apartejs.dev/shots/<name>.png`). The four framework packages show an assistant reply with a card, a formula and a chart.
