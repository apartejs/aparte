---
'@aparte/core': patch
---

Fixed: the default skeletons were painted with a palette core no longer uses, and a
consumer could not override them.

`APARTE_DEFAULT_SKELETON_FALLBACKS` carried its look in a `style=""` attribute — six
inline declarations of Tailwind-slate hex (`#9ca3af`, `#1e293b`, `#64748b`), the exact
palette this theme replaced. An inline style is the one thing a consumer's stylesheet
cannot reach, so a dark-theme host got a light-grey label with no way to change it, and
hex inside a `.ts` is invisible to `check:derived-vars`, which reads only `styles/`. The
look now lives in `styles/display/skeleton.css` on the tokens every other recipe reads.

They also had a second owner. `AparteConfig._defaultSkeletonRenderer` held a hand-written
copy of the same table and the two had already drifted — `message` said "Loading
message..." in one and "Loading..." in the other. There is one table now, and the test
that used to explain why it could only compare content asserts identity instead.

New classes: `aparte-skeleton-fallback`, with `--code`, `--snug` and `--tight`.
