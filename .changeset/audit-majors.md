---
'@aparte/core': minor
'@aparte/svelte': minor
'@aparte/plugin-model-selector': patch
---

**Seven behavioural defects from the same audit.**

**A tool call keeps its state word through a config change.** `relabel` rebuilt the row's badge as the icon alone, so any `setLocale`, `setIconProvider`, `registerTool` or `reset()` deleted the localized word beside it — permanently, because a settled call gets no further `update()`. "Done" went bare and pending's "Running" went empty; four of five statuses regressed. It now goes through `stateBadge`, whose own docblock claims "one function so `render` and `update` cannot disagree" and which `relabel` had never been folded into.

**Breaking, pre-1.0: the last bare CSS class is prefixed.** The unknown-segment fallback emitted `class="segment aparte-segment-unknown"` — the rename had prefixed the second token and left the first, so 0.11.0's claim that *every* class core emits is prefixed was false. `.segment` is Semantic UI's base layout class, which is one of the two reasons that rename happened. **If you styled `.segment`, it is `.aparte-segment` now.**

**Three CSS rules no longer reach out of core.** `[data-status="resolved"] .aparte-tool-state` and its two siblings were the only rules in the stylesheet whose leftmost compound is an unprefixed non-element selector. A host wrapping the chat in `<div data-status="rejected">` re-tinted every completed tool call's word red. Now scoped to `.aparte-segment-tool-call`.

**Stop in one chat no longer tears down another chat's open question.** The receive side already resolved its own chat host when no `target` attribute is set — which is all of raw core, since the documented markup sets none. The send side read the attribute only, so the abort carried `targetId: undefined`, and a missing id means "for everyone".

**A number binding with no value no longer writes `"NaN"`.** Angular's `numberAttribute` returns `NaN` for undefined, null, `''` and any non-numeric expression, so `[scrollThreshold]="cfg.threshold"` on an unset field wrote `scroll-threshold="NaN"` — and `parseInt('NaN' || '50', 10)` is NaN because `'NaN'` is truthy, so the transcript stopped following a streaming reply and the scroll-to-bottom button never hid. `applyElementProps` removes the attribute instead, restoring the documented default. `0` still writes, because 0% is a value.

**A CSS variable with no value is removed rather than stringified.** `props={{ '--aparte-select-bg': theme.selectBg }}` on an optional field set the property to the token `undefined` — worse than leaving it alone, because a property that is *set* makes every `var(--x, default)` skip its fallback and become invalid at computed-value time, so the declaration is dropped and the control renders unstyled. An object became `[object Object]` the same way.

**`@aparte/svelte`: five events are bindable again.** The `on:` surface derives from `HTMLElementEventMap`, which deliberately omits the events carrying no detail. Harmless while that only governed `addEventListener` — but declaring the tags removed `SvelteHTMLElements`' catch-all index signature, so `on:aparte-cancel` (the stop button), `on:aparte-composer-submit`, `on:aparte-reset-done`, `on:aparte-select-open` and `on:aparte-select-close` stopped type-checking. All five are Angular `@Output()`s, so the wrappers were not at parity.

Closed by deriving from core's proxy list as well, which already enumerates every event an element dispatches on itself. `APARTE_DEFAULT_UI_EVENTS` becomes `as const` so the literals exist at the type level, and core exports the new type **`AparteUiEventName`**.

**`@aparte/plugin-model-selector`: the framework peer ranges are fixed.** `react: "^19.2.7"` and `svelte: "^4.2.0"` were copied from the package's own devDependency pins, excluding React 18 and Svelte 5 — both supported by the matching wrappers. An out-of-range peer that is present is an ERESOLVE conflict whether or not it is optional, so installing this plugin in a Svelte 5 app failed. Now `^18.0.0 || ^19.0.0` and `^4.0.0 || ^5.0.0`, matching the wrappers.
