---
'@aparte/core': minor
---

Links in a reply now open in a new tab, same-site ones included; `setLinkTarget('external-only')` keeps same-site links in the page.

```ts
import { aparteGlobalConfig } from '@aparte/core';

// As before: only a link to another site opens a new tab.
aparteGlobalConfig.setLinkTarget('external-only');
```

Do you have to touch your code? Only to keep a same-site link in the page. A relative link the model writes — `[package.json](package.json)`, `/docs` — used to be followed in place, which replaces the page the chat lives in: in a single-page app or an Electron window, the whole app and the conversation with it. It now opens in a new tab, with `rel="noopener noreferrer"`. To route a link yourself, cancel `aparte-link-click`, as before.

- **What stays as written.** A link to a place in the page (`#…`), and `mailto:`, `tel:` and `sms:`, for which a new tab is left empty. A `target` the model writes still chooses nothing.
- **Whichever sanitizer.** The rule runs in `sanitizeHtml` after the sanitizer, beside the image policy, so one set with `setHtmlSanitizer` keeps it — DOMPurify alone drops `target`, and every external link then navigated the chat's own frame. Under `'external-only'` the built-in sanitizer's own clamp is applied on top of yours. A server render gets the same links.
- **For a plugin that draws links**, `decideLink(href)` answers what to set: `{ target: '_blank', rel: 'noopener noreferrer' }`, or `{}` for a link that stays in the page. `getLinkTarget()` reads the mode, and setting it draws what is on screen again.
- **Sources.** A source's link in a citation card now fires the chat's cancelable `aparte-link-click`, as a link in the text does: the card is drawn beside the transcript, outside the message, which never heard its clicks, so an app could not route it. It is announced on the chip, inside the message, with the same `{ href, anchor, messageId }`. A source's link, in the card or the list, follows the link target too.
- **Weight.** 267.4 KB gzip, up 1.6 KB: the pass over a reply's links, and its twin for a runtime with no DOM.
