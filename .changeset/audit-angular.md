---
"@aparte/angular": patch
---

All twenty generated element directives are exported — `AparteContextDirective`, `AparteIconDirective` and `AparteSuggestionsDirective` were missing from a hand-written list, so `<aparte-icon>`, `<aparte-suggestions>` and `<aparte-context>` were tags nothing claimed. `provideAparte({ themeMode })` reads Angular's injected `DOCUMENT` instead of the globals, so an app initializer no longer touches `document`/`window` under Universal.
