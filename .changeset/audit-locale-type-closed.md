---
"@aparte/core": minor
---

`AparteLocale` is now closed, so `t('typo')` is a compile error instead of an empty label at runtime.

Your own extra keys still work, and still round-trip: `setLocale`, `extendLocale` and `getLocale` all carry `AparteLocale & AparteLocaleExtensions`, the new open half, so a plugin reads its own key off `getLocale()` exactly as before. What changes is `t()`, which now accepts core's own keys only — which is the point. (`AparteLocale` is a type alias rather than an interface, because an interface has no implicit index signature and so is not assignable to the extensions half.)

The interface used to end with `[key: string]: string | undefined`, and that one line disabled the only compile-time check the locale had. `AparteConfig.t(key: keyof AparteLocale)` looks airtight; with an index signature `keyof` widens to `string` and every literal typechecks. An audit planted `t('copy') → t('copyCodeBlock')` as a deliberate mistake and nothing saw it: `tsc --noEmit` exited 0, `t()` returned `''` at runtime, and the label rendered empty with no error, no warning and nothing on screen to notice. Three keys had already reached production that way (`submitButton`, `stopButton`, `actionUpload` — read for months, declared by nobody), and a user reported the last one from a live language switcher.

`node scripts/check-locale-keys.mjs` is the second layer, for the places the compiler cannot reach: a computed `t(key as never)`, and the mirror direction TypeScript is blind to — every locale key is optional, so a French bundle that MISSES one compiles perfectly and ships English in the middle of a French page.
