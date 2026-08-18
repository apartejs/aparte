---
"@aparte/core": minor
---

New `AparteConfig.resetLocale()`: restores the built-in English locale after a
`setLocale(...)` call, without having to import `DEFAULT_LOCALE` yourself.
Notifies mounted components like every other live setter.
