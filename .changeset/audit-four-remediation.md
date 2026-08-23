---
'@aparte/core': minor
'@aparte/engine': minor
'@aparte/plugin-marked': minor
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
---

A fourth cold audit: two CRITICALs, fourteen MAJORs, and the guards that let four of them in

Same protocol as the third — five auditors, no changelog, no git history. It found less
on the surface and more underneath, which is the only progress worth reporting: the two
CRITICALs were both in code less than two days old, and four of the MAJORs were defects
in the guards rather than in the library.

**The two CRITICALs share a root: `{ config }` scoped what a chat READ and not what it
ANSWERED.** `AparteClient` listens on `window`, and its only instance filter was
`scopeToTargetId`; unset, the guard returned `true` for everything. Two config-scoped
clients on one page therefore both ran a full agentic turn for every send — two provider
calls, two paid completions, both replies appended into the single target the event
named. A config-scoped client now declines a target whose boundary resolves a different,
non-global config; a client on the global config still answers everything, which is every
single-chat app. The second: opening a conversation revoked its own attachments' object
URLs, because `clearAll()` releases them and both `setMessages` and `importTree` put the
messages straight back — and `export()` stores live references, so the two views share the
very same attachment objects. Every image and file chip was dead on load.

**Three MAJORs in the turn.** A mid-stream `error` event erased everything already
rendered: `_handleLifecycleError` replaced the segments instead of appending, so a partial
answer plus an error became an empty bubble with an error in it. `toolTimeoutMs` could not
time anything out — all three copies aborted a signal and then awaited the handler with no
race, and aborting is a request a handler may ignore, which the default shape of a
consumer tool does. Core's two copies now share `withToolTimeout`. And the engine
compactor could emit a window opening on `role: 'tool'`, which every OpenAI-compatible
provider rejects with a 400: compaction turned a long conversation into an unusable one.

**Consent is scoped to the chat that asked.** Human-in-the-loop approval matched on the
model-chosen `toolCallId` and nothing else, on a `document` listener, with built-in buttons
that bubble and compose — so on a page with two chats, a click aimed at one tool could
satisfy the gate awaiting a different tool in a different conversation. The check is now
DOM containment: a model can choose an id, it cannot choose where a click happened. A
programmatic dispatch from a host is still honoured.

**Three more surfaces where per-instance config did not reach what it configures.**
`injectRendererStyles()` collected the global's styles over an instance config's, so a
renderer registered on a config drew unstyled and silently; it now takes the config and
accumulates rather than assigns, and re-creates its `<style>` when the old one has been
detached rather than only when it is null. `setupMarkedProvider(options)` scoped the
provider and not the options — `marked.use()` mutates a module singleton cumulatively, so
configuring the second chat retroactively changed the first's rendering. And the global
type augmentations reached the browser entry only, so an SSR consumer silently lost typed
`e.detail` on every aparté event.

**Every `AparteChat` accepts a caller-supplied host id.** `scopeToTargetId` matches
`detail.targetId`, which the wrappers set from an id they generated and neither accepted
nor exposed — so the documented mechanism was unreachable from three of the four
components. React, Vue and Svelte gain an optional `id` prop; Angular already honoured
one. The generated id remains the default.

**The artifact preview stops overclaiming.** Its comment said everything leaving the frame
is blocked. The fetch half is true and measured in three engines; the frame navigating
ITSELF is not a fetch and no directive governs it — `navigate-to` was removed from the
spec and never shipped. No CSP or sandbox token stops it, so the fix is the claim, plus a
danger block on `setArtifactPreviewBuilder`, which was one line that never mentioned it
replaces the policy while recommending CDN libraries.

**Four MAJORs were the guards.** `check-doc-snippets` compiled with a WEAKER profile than
the repo compiles itself with — no `noUncheckedIndexedAccess`, `noImplicitReturns`,
`noFallthroughCasesInSwitch` or `noImplicitOverride` — so a snippet could be certified
while a reader's build, following this project's own recommended settings, rejected it.
Aligned, it immediately failed the flagship getting-started example.
`check-export-mentions` could not read a barrel written as `export *`, saw 4 names for the
engine's 39-name surface, and then certified the package already at zero unmentioned; it
also credited a short export whenever a longer documented name merely contained it, and
its list of barrels omitted the plugins, providers and locale-fr. `check-node-barrel-types`
diffed export names, which an augmentation module has none of. `check-wrapper-slots` proved
nothing about the host id. All four now bite, verified by sabotage one at a time, and the
export guard gained the SEEN floor that a collapsed count needs — the third guard in this
repo to need it for the same reason.

**The wrapper reference has examples.** Eleven of the sixteen slot × framework
combinations appeared in no code block anywhere, in a page whose own history is the reason
this project has a rule about capabilities cited in passing. The page is generated, so each
slot now emits one fence per framework from the same table as the syntax column.
