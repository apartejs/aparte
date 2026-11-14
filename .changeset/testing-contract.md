---
'@aparte/core': minor
'@aparte/angular': patch
---

End-to-end tests have a stable contract: `[data-aparte-chat]`, the field's role and name, `aparte-composer-send[data-act]`, `[data-role]`, `[aria-busy]`, `[data-error-code]` — see [Testing your chat](https://apartejs.dev/guides/testing/).

Do you have to touch your code? Only if a CSS rule or a query of yours uses `[data-aparte-chat]` to mean the `<div>` a React, Vue or Svelte chat renders: it now matches `<aparte-chat>` and Angular's host as well, so write `div[data-aparte-chat]` to keep the old meaning. Core's own stylesheets name `aparte-chat` beside `[data-aparte-chat]` in every rule, so nothing in the chat restyles.

- **The root, in every framework.** `<aparte-chat>` now carries `data-aparte-chat` when it connects, and Angular's component declares it on its host, so the server render has it too. React, Vue and Svelte already rendered it on their root.
- **Send, Stop and Submit.** `<aparte-composer-send>` says what a press does now, `send`, `stop` or `submit`, in `data-act` on itself. The button inside keeps its own `data-act`, which the stylesheet reads. Press the button: `aparte-composer-send[data-act="stop"] button`.
- **A reply that ended no longer says it is streaming.** The viewport writes `streaming` on the bubble it appends for a reply on its way, and nothing took it off, so after a turn every reply of a vanilla chat still matched `aparte-chat-bubble[streaming]`. The bubble takes it off when the reply ends, however it ended: finished, failed or stopped. The reply's `aria-busy` was always right; that is the hook for a test.
- **Frozen.** `data-aparte-chat` and `data-act` are declared read-only on their elements, so the frozen surface lists them next to `data-role`, and removing one needs a notice release first. The field's role and name, `aria-busy` and `data-error-code` sit on parts inside an element and are not on that list; a test plays a real turn and reads all three, and the guide's Playwright example runs on the six example apps.
- **The field's name.** Its placeholder is its accessible name, so `getByRole('textbox', { name })` finds it. `getByPlaceholder` does not, because the field has no `placeholder` attribute. The composer page and the input's reference say so.
