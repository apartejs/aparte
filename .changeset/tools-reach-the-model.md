---
'@aparte/core': minor
'@aparte/provider-openai-compat': minor
'@aparte/plugin-model-selector': minor
---

No tool ever reached the model, and three smaller things a first test session found

All four of these came out of one person sitting down with the examples and a local
LM Studio, which found in twenty minutes what four from-scratch audits had not. The
pattern is worth naming: an audit reads the code, a user runs it.

**A registered tool was never sent.** `AparteClient` gates the request's `tools`
array on `getCurrentModel()?.capabilities?.includes('function_calling')`. Three
facts made that gate permanently closed on the documented primary path:
`getCurrentModel()` read `provider.getModels()` — the synchronous, hand-declared
list — which every preset of `@aparte/provider-openai-compat` leaves empty because
a compat endpoint's list only exists after a `GET /models`; `fetchModels()` never
wrote its result anywhere the resolver could see; and it declared only
`['streaming']`. So `getTools()` held the tool the app had registered and
`tools: []` went on the wire. The model then answered, correctly, that it had no
such tool — which is exactly what a tester saw, with no error and no warning
anywhere. The whole tools guide, `needsApproval`, human-in-the-loop approval and
`@aparte/plugin-ask-user` were inert.

Three changes, each with the reasoning where it lives. `AparteConfig` caches what
`refreshProviderModels()` brings back and `getCurrentModel()` consults it before
the static list. `openai-compat` declares `function_calling`, because a `tools`
array is a property of the wire format it implements, not a guess about the model —
`/models` returns `{id, object, owned_by}` and will never say otherwise, so waiting
for it to declare the capability means never declaring it. And the gate now asks
whether the model said it CANNOT rather than whether it said it can: a model that
declares its capabilities and omits function calling is still honoured, but an
unknown model — the common case — no longer turns an explicit `registerTool` into a
silent no-op. Over-sending means a model that cannot call a tool does not call one;
under-sending was silent and total. Two end-to-end tests that had been parked on
this decision are now running.

**`requireModelSelection` is enforced by the thing that runs the turn.** It was
drawn by `aparte-composer` — greying itself, refusing `submit()` — and enforced
nowhere else, so any other route to an `aparte-send` walked past it: a suggestion
chip, a "try this prompt" button, a host dispatching the event itself. The turn
then ran with `config.defaultModel || ''`, an empty model id on the wire. Reported
from an example, where the chips above the composer stay clickable while the
composer is visibly greyed out waiting for its model list. The client now refuses
such a send and says why, because the developer is who can fix it — an app that
gates should disable its own affordances too.

**The model selector's dropdown was ordered by a race.** It fetches every
provider's `/models` in parallel and pushed each result as it arrived, so the order
— and therefore what `auto-select` lands on — was decided by whichever endpoint
answered first. A cloud provider on a CDN beats a local server that has to wake up,
which means an app registering `[local, local, cloud]` could land on the paid one,
and on a different one after a reload. The list is indexed by registration order
now: `auto-select` documents itself as "the first model", and first has to mean
first.

**And the guide that described the old gate** said tools are sent "only when the
selected model's `capabilities` include `function_calling`", which was true and is
the sentence that made the behaviour look intended rather than broken.
