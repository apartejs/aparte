---
"@aparte/core": minor
---

**Only the affordances core can honour end-to-end are enabled by default.** A button
that answers to nobody is worse than a missing feature — the user clicks it and
concludes the app is broken. Six controls were in that state, and the proof it had
gone unnoticed is that not one of our own six playgrounds handled
`aparte-message-info`, `aparte-attachment-preview` or `aparte-terminal-run`.

Core copies text on its own, so `copy` stays on. Everything else now waits for the
app to say it is there:

| Control | Needs | Was | Now |
| --- | --- | --- | --- |
| `retry` | a host that re-sends | on | off |
| `edit` | a host that keeps the new text | on | off |
| `info` (ⓘ) | your stats popover | on, **and unremovable** | off |
| image-tile preview | your lightbox | always | off |
| terminal `Run` | your executor | always | off |
| download on a *binary* artifact | your file generator | always | off |

Edit was the worst of them: it opened, accepted text, saved — and the original text
came back, because replacing it is the client's job.

**Migration** — if you run `AparteClient` (or handle the events yourself), one line
restores the action bar you had:

```ts
AparteConfig.setBubbleActions({ retry: true, edit: true });
```

and for the three affordances outside the bar, declare what you handle:

```ts
AparteConfig.setHostHandlers({ attachmentPreview: true, terminalRun: true, artifactRedownload: true });
```

No event and no API was removed — core just stops offering what nobody answers. Also
in this release:

- **`info` is a bubble action like the others.** It was pushed at the tail of the flag
  branch: impossible to turn off, and impossible to request in an explicit per-role
  list (`'info'` was not an `AparteBubbleActionName`). Both directions work now.
- **A declared image tile is a real button** — `role="button"`, a tab stop and
  Enter/Space — instead of a `<div>` with a click listener. Undeclared, it carries no
  role and no pointer cursor: half-signalling is the same lie in a quieter voice.
- **An empty action bar is no longer rendered.** With every action off it stayed as a
  `role="toolbar"` holding nothing and still reserved 28px under every bubble. The
  bar and the footer now follow their contents (a branch picker alone still gets its
  row).
- New exports: `setHostHandlers` / `getHostHandlers`, `DEFAULT_BUBBLE_ACTIONS`,
  `DEFAULT_HOST_HANDLERS` — read the defaults instead of hard-coding them.

Untouched on purpose: `copy` on a terminal segment, download on a **text** artifact,
the `‹1/2›` branch picker, the waiting indicator, the stop button and the model
selector — core honours all of those itself.
