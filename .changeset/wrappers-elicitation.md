---
"@aparte/react": minor
"@aparte/vue": minor
"@aparte/svelte": minor
"@aparte/angular": minor
"@aparte/core": patch
---

The four wrappers render `<aparte-elicitation>` inside their host by default; pass `elicitation={false}` (`:elicitation="false"` in Vue, `[elicitation]="false"` in Angular) to opt out. **If your app registers its own presenter with `setElicitationPresenter()`, you must pass it**: the built-in presenter registers with the chat as its owner and wins the match for that chat's requests, so without the opt-out your questions would open core's panel instead of your presenter.

Core's `<aparte-chat>` has shipped the presenter in its default composition since the built-in approval gate started asking through it, and the wrappers had not followed: a `requestUserInput()` under `<AparteChat>` rejected with the "no presenter" warning, and that warning told you to add the element "inside your `<aparte-chat>`" — a tag the wrappers do not render. The first consumer to hit it appended the element to `[data-aparte-chat]` by hand. The warning now names the framework host too, and the composer's docblock names the four lifecycle events that drive its `streaming` flag (`aparte-message-start` sets it; `-done` / `-error` / `-aborted` clear it) instead of "lifecycle events on window".
