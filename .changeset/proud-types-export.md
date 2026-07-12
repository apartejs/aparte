---
"@aparte/core": patch
---

Re-export the `AparteSystemPromptVarsProvider` type from the package root (both
the browser and Node entries) so consumers can type the argument of the public
`AparteConfig.setSystemPromptVarsProvider()` without reaching into a deep import.
