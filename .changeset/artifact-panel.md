---
'@aparte/plugin-artifacts': minor
'@aparte/core': minor
'@aparte/locales': minor
---

New `<aparte-artifact-panel>`: a conversation's document beside the chat, with its versions. Import it from `@aparte/plugin-artifacts/panel`.

```html
<aparte-split position="40" single>
  <aparte-chat id="chat">…</aparte-chat>
  <aparte-artifact-panel for="chat"></aparte-artifact-panel>
</aparte-split>
```

```ts
import { setupArtifacts } from '@aparte/plugin-artifacts';
import { connectArtifactPanel } from '@aparte/plugin-artifacts/panel';

setupArtifacts();
connectArtifactPanel({ chat, panel, split });
```

`connectArtifactPanel` turns on the card's Open button for that chat: a press shows that version in the panel, opens the split's pane and moves the focus to the title; Close, or Escape, folds the pane and gives the focus back. `autoOpen: true` opens the pane when a turn writes a document. The split is optional (`onOpen`, `onClose` for a dialog or a drawer).

The panel reads the conversation and keeps nothing of its own. One header row holds the title, the version arrows, your own buttons (a child with `slot="actions"`), the card's Code and Preview tabs, Copy, Download and Close. A Markdown document is shown rendered, for reading; a page or a component is shown as source and runs only on a press, as on the card. It also takes your own documents (`documents`), an agent's own tool (`read`) and your own rendering of one kind (`render`). It is a separate entry, so an app that only wants the card does not ship it.

Four locale keys come with it, translated in the nine languages of `@aparte/locales`: `closeArtifact`, `artifactVersion`, `previousVersion`, `nextVersion`.
