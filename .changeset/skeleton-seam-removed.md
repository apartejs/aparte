---
"@aparte/core": minor
"@aparte/angular": minor
---

`setSkeletonProvider`, `getSkeleton`, `AparteSkeletonProvider`, `AparteSkeletonType` and `APARTE_DEFAULT_SKELETON_FALLBACKS` are removed from `@aparte/core`, and `provideAparte({ plugins: { skeleton } })` from `@aparte/angular`. The `.aparte-skeleton` CSS recipe stays. If you registered a skeleton provider, delete the call: nothing read it.

Nothing in core ever called `getSkeleton()` — no component has a loading state that is not the message itself, so the seam was a contract with no consumer on either side, and the six fallback strings it shipped (and their four CSS classes) were dead weight in every bundle. A consumer who wants a placeholder uses the recipe, which is the part that was real.
