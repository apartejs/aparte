---
title: Accessibility
description: What aparté's components do for accessibility, what they leave to you, and what is checked automatically rather than promised.
sidebar:
  order: 14
---

A chat is a hard surface to get right: content arrives on its own, the newest thing is at
the bottom, and a reply can take ten seconds during which nothing visibly happens. This
page is the split — what core does, what it leaves to you, and which half is verified by a
machine rather than by this sentence.

Everything below was read off the source. Where a number appears, it was counted.

## What core does

### The transcript announces itself

The viewport's scroll container is a live region: `role="log"` with `aria-live="polite"`,
so a screen reader reads a reply as it arrives rather than only on demand. Each message is
a `role="article"` with an `aria-label` naming its author.

The waiting state is separate and deliberate: `<aparte-chat-status>` is `role="status"` /
`aria-live="polite"`, and the pipeline-waiting segment is a `role="status"` carrying the
phase's label. A turn that pauses between two steps therefore says so, instead of leaving
a silence a reader cannot distinguish from a hang.

The branch picker announces its move through a visually hidden `.aparte-sr-only` node
rather than by moving focus — pressing `›` should not steal the caret from wherever you
were.

### Names come from the locale

Every `aria-label` core writes is read from the active locale, not baked into the markup.
Switching language relabels the controls that are already on the page — which is why
`relabel()` exists on the elicitation panel rather than a rebuild: a reader may be halfway
through answering.

That also means an unlocalised string is a missing translation, not a missing label: each
falls back to English.

### Keyboard

`<aparte-select>` implements the combobox pattern in full: <kbd>Enter</kbd> or
<kbd>Space</kbd> opens, <kbd>ArrowDown</kbd> opens and moves, <kbd>ArrowUp</kbd> moves back,
<kbd>Home</kbd> and <kbd>End</kbd> jump to the ends, <kbd>Escape</kbd> closes, and
<kbd>Enter</kbd> chooses. It carries `role="combobox"`, `aria-expanded`, `aria-controls` and
`aria-activedescendant`, and its listbox carries `role="listbox"` / `role="option"` with
`aria-selected`.

The composer's editor is a `role="textbox"` with `aria-multiline="true"`, labelled from its
placeholder. <kbd>Enter</kbd> sends and <kbd>Shift</kbd>+<kbd>Enter</kbd> breaks the line;
`submit-on-enter="false"` swaps them for a composer where the reverse is the expectation.

A conversation-list row is activatable with <kbd>Enter</kbd> or <kbd>Space</kbd>, and its
two row actions are real buttons in the tab order.

### Focus, contrast and motion

- **30** `:focus-visible` rules across the stylesheets — every control core draws has a
  visible keyboard ring, and it is `:focus-visible` rather than `:focus`, so a mouse click
  does not leave one behind.
- **22** `forced-colors` blocks. Windows High Contrast drops backgrounds and shadows, so
  anything whose whole silhouette was a fill gets a real border there instead — the
  segmented tab's active pill and the tooltip both do, and the tooltip's arrow is hidden
  rather than left as an unlabelled diamond.
- `prefers-reduced-motion` is honoured **at the source**: the duration tokens themselves are
  overridden, so every transition and animation that reads one stops — including in CSS the
  library does not own. A second sweep, scoped to aparté's own tags and never to your page,
  catches whatever the tokens cannot reach. The announcement does not stop with the motion:
  activity keeps being conveyed through `aria-live` and `aria-busy`.
- Under `pointer: coarse` the control set re-sizes to `--aparte-touch-target-size` (44px).

## What core leaves to you

None of these is an oversight. Each is a place where the library cannot know enough to be
right, and guessing would be worse than saying so.

**The neutral classes draw, they do not announce.** `.aparte-menu`, `.aparte-accordion`,
`.aparte-popover` and `.aparte-tooltip` are surfaces — the roles (`role="menu"`,
`role="menuitem"`, `role="tooltip"`) and the arrow-key handling those patterns require are
yours. A menu that looks like a menu and reports as a group of buttons is worse than one
that looks plain, so put the roles on.

**Arrow-key navigation in the conversation list.** Rows are reachable and activatable, and
`role="navigation"` says what the list is — but there is no roving `tabindex`, so a long
history is a long tab sequence. If that matters for your app, it is yours to add.

**A name for each chat, when there are several.** One `<aparte-chat>` on a page needs
nothing. Two need `aria-label` to tell a screen-reader user which log they are in.

**Custom actions need a `label`.** `registerAction({ icon, label })` uses the label as the
button's accessible name. An icon-only action without one is an unlabelled button.

**Render hooks that return a string** carry the accessible name too, not just the escaping.
Returning an element and setting `textContent` is the safer half of the same advice — see
[Customization](/guides/customization/#render-hooks).

**Everything outside the chat.** A heading structure, a landmark for the page, a skip link:
core renders one region of your app and has no view on the rest of it.

## What is actually checked

Two mechanisms, neither of them this page:

**axe, in a real browser, on every run.** Six specs run against all five example apps in
Chromium, Firefox and WebKit, and they fail on any *critical* or *serious* violation:

- an idle chat,
- a streamed exchange,
- an open model dropdown,
- a turn in flight,
- a failed turn,
- and one that is not an axe scan at all — the composer is reached, filled and sent using
  the keyboard alone.

The last two matter most, because they are the states a manual pass skips: nobody thinks to
audit the error card, and nobody tabs to the send button.

**A unit test** pins the conversation list's row actions in the tab order, which is the
regression that would otherwise be invisible.

What none of that proves: axe catches what a machine can see. It does not know whether your
labels *say* anything useful, whether the reading order matches the visual one in your own
layout, or whether the whole flow is usable with a screen reader — which is a person's job,
on your app, once.
