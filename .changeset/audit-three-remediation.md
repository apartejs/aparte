---
'@aparte/core': minor
'@aparte/engine': minor
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
'@aparte/angular': minor
'@aparte/plugin-model-selector': minor
'@aparte/plugin-shiki': minor
'@aparte/plugin-marked': minor
---

A third cold audit, and the one CRITICAL it found

Five auditors, five dimensions, no access to the changelog or the git history —
because a previous round proved seven of the maintainer's own claims false, and an
auditor who reads the changelog is grading the essay rather than the code. One
CRITICAL, twenty MAJOR. All twenty-one are closed here.

**The CRITICAL, and its family.** `<aparte-elicitation>` registered its presenter
on the config it could resolve at `connectedCallback`. All four wrappers call
`AparteChatHost.bind()` — which runs `attachConfig` — from a post-mount hook, so
the element connected *before* the boundary existed and registered on the global
singleton. `requestUserInput()` then resolved the instance config, found no
presenter, and returned `{action:'cancel'}`: **the model was told the user refused
a question the user was never shown.** Silent, and in the supported multi-chat
path.

An earlier sweep for this bug class fixed every element that READS its config live
and missed both that WRITE to it — a write has already happened, so resolving live
cannot save it. `attachConfig`/`detachConfig` now notify the subtree, and a
registrant implements `AparteConfigAware.aparteConfigChanged(next, previous)`.
Three MAJORs shared the root cause: `<aparte-model-selector>` cached its config
(and its subscription) at connect; a segment renderer registered the documented way
landed on the global and was invisible to any chat with a `config` prop — an
instance config now inherits global registrations; and all four wrapper
conversation-manager hooks wrote the manager to the global, making `config` +
persistence a silently degraded mode. `init(adapter, config?)` on all four.

**The streaming seam lost text three ways.** A non-streaming (string) reply skipped
the parser flush, so a reply ending on a backtick or `<` lost that tail and one
made only of those rendered nothing. The XML machine finalized *after* the parser
flush, so the text it hands back — always a prefix of `<artifact` — reached a
parser that would never be flushed again; the loss was total. And the adapter's
pre-tag path could add a segment but not update one that had just completed,
freezing a code block mid-fence. The parity suite gained the two scenarios that
missed all of this by a delta boundary, and it immediately rejected the core-side
fix as well: it had split one sentence into two segments and put the held prefix
*before* the prose it follows.

**Security.** The artifact preview's `<meta>` CSP was inserted relative to the
first `<head>` the model's markup declared — and a meta policy governs only what
follows it, so a `<script>` placed before that tag ran uncontained. Reproduced in
Firefox, WebKit and csp-attribute-less Chromium; since the `csp` iframe attribute
is Chromium-only, this meta is the only containment those engines get. Three
branches collapse to one: always first. `AparteToolRenderer.render` now returns
`string | HTMLElement` like its sibling, and both it and the guide say that
`toolCall.input` is model-chosen. And the primary backend-handler snippet no longer
satisfies the mandatory `authorize` gate with `Boolean(req.headers.get('cookie'))`,
which authenticates nothing.

**Migration.** `getHostHandlers()` returns `Required<AparteHostHandlersConfig>` —
four fields, `artifactRehydrate` included. `AparteToolRenderer.render` widened, so
existing string renderers keep working. The page-global config moved to a versioned
`Symbol.for` key: two copies of `@aparte/core` on one page now get one global each
instead of sharing an object across which `instanceof` is false. The `shiki` and
`marked` peer ranges narrowed to the majors this repo tests against (`^4` and
`^18`) — an over-narrow peer is a warning you can override, an over-wide one is a
lie.

**Six of the twenty MAJORs were defects in the guards themselves**, which is the
part worth reading twice. Seven gate steps ran in no CI workflow, five of them
guards that bite — and the only place their names appeared under `.github/` was a
comment narrating a previous audit finding the same thing. `check:gate-in-ci` now
diffs the workflow against the gate chain. `check-event-map` was blind to
object-shorthand `detail`, exempting the ten most important events.
`check-doc-snippets` waived every diagnostic in a fence containing one unresolved
name — 44 of 118 fences, hiding two `for await` SyntaxErrors in the branching
guide. `check-bundle-entries` read a re-export shim and skipped the chunk where
core lives, and could not have seen an inlined dependency at all, so it gained an
assertion that core's manifest declares none. `check-export-mentions` could not see
type-only exports; measured once it could, 141 public exports were named on no
page, now on a per-package ratchet that a new component cannot raise.
