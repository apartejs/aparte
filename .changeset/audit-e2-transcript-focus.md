---
"@aparte/core": minor
---

The transcript can now be focused and scrolled with the keyboard in Safari; it carries a name for screen readers.

`<aparte-chat-viewport>`'s scroll surface gets `tabindex="0"` and an `aria-label` — on `.aparte-viewport-container` in the default mode, on the host itself in `framework-managed` mode, since that is what scrolls there. It also carries `role="log"`, which the container already had and the host did not: `aria-label` is prohibited on an element whose role resolves to none, so a name without a role would have been the same defect mirrored. In `framework-managed` mode that makes the transcript a polite live region, as it already was in the default mode. The name comes from a new locale key, `transcript` (default "Transcript"), translated in `@aparte/locale-fr` and re-applied on a live language switch.

If your app tabs through the page in a fixed order, there is one more stop in it, between the chrome above the chat and the composer.

WebKit does not give an unfocusable overflow box a keyboard scroll of its own the way Chromium and Firefox do. So on Safari a plain-text transcript — no links, no code blocks, nothing focusable inside — stopped at the first screen for anyone not using a pointer, with no error and nothing on screen to say why. The framework mode looked fine and only by accident: the scroll-to-bottom button is a child of the host and stays tabbable while it is visually hidden, so Tab happened to land somewhere that scrolled. That is a coincidence, one `hidden` attribute away from taking the transcript's keyboard access with it, so both modes now say what they mean. Proven in a real WebKit run (`e2e/tests/transcript-keyboard.spec.ts`), which is the only place the defect is visible at all.
