---
'@aparte/plugin-artifacts': minor
'@aparte/core': minor
'@aparte/locale-fr': minor
---

New `setupArtifacts({ open: true })` puts an Open button on the artifact card, which dispatches `aparte-artifact-open` with `{ artifact }` so the app can show it in a pane, a dialog or a tab of its own.

Off by default: the card cannot know where the app's pane is, and a button nothing answers would be a promise the library cannot keep. The event bubbles out of shadow roots and is typed (`ArtifactOpenEventDetail`) wherever the plugin is imported. Its label is the new locale key `openArtifact` ("Open", "Ouvrir").
