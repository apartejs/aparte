# @aparte/provider-scenario

## 0.16.4

## 0.16.3

## 0.16.2

## 0.16.1

## 0.16.0

### Patch Changes

- 0556897: A `match()` that returns something other than a scenario key — the scenario object, an unknown name — is said in the console, naming what it returned and the keys the provider knows, instead of streaming an empty turn in silence ("Typing…" forever, issue #29). The value-branching pattern — the tool's result carries the answer, `match` reads it back from the last `tool_result` — is documented.

## 0.15.1

## 0.15.0

### Patch Changes

- 47dddaa: The `showcase` preset gains a `survey` turn — "two questions", "a few questions" or "survey" makes the model ask two questions in one `ask_user` call, so the panel's stepper (1 2, a Skip per step) has a scenario that shows it. Nothing in the repository rendered that mode until a consumer reported clipped borders on it; a state no example renders is a state nobody looks at.

## 0.14.0

### Minor Changes

- 1912df6: New package: `@aparte/provider-scenario`, a scripted model. `createScenarioProvider({ turns })` answers the model's calls in order; `createScenarioProvider({ scenarios })` picks a named turn by `when` (the last user message) or `after` (a tool's result). A turn is text streamed at a typing pace, thinking, a tool call the real loop runs, an error, a pause, a usage override. `showcase` is a ready-made set covering the whole surface of a chat. No key, no network, no dependency of its own.

  Three things in this repository had written it by hand: the browser suite's wire mock, the UI audit's screenshot harness, the docs' live frames. It is also the piece nobody ships for consumers — a deterministic model for their own tests, and a demo that streams without a backend. The repository's browser suite keeps its network mock on purpose: it tests the wire path this provider bypasses.
