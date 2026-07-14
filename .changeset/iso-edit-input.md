---
"@aparte/core": patch
---

Message editing now reuses the composer's contenteditable input instead of a bespoke
`<textarea>`, so editing a message is iso with composing one:

- Same input primitive (`<aparte-composer-input>`): autosize, IME handling, paste, placeholder
  and styling are shared. The edit box is styled like the composer shell.
- **`Enter` saves, `Shift+Enter` inserts a newline** (was `Ctrl/Cmd+Enter`); `Esc` still cancels.
- The save/cancel icons route through the icon provider (`getIcon('check')` / `getIcon('close')`),
  so `setIconProvider` overrides them too; their colours stay themable via `--aparte-success` /
  `--aparte-error`.

`<aparte-composer-input>` is now usable standalone: with no `<aparte-composer>` parent it emits a
bubbling `aparte-composer-submit` event on submit instead of no-op-ing, and gains a `focusEnd()`
method (focus with the caret at the end of the content). Its contenteditable also handles newlines
robustly now — `Shift+Enter` inserts a single deletable `<br>` (no `<div>` wrappers), an empty
field can't start with a blank line, and `getValue()` preserves newlines (`<br>` → `\n`).

The `aparte:edit` event contract is unchanged.

Also fixes `<aparte-chat center-empty>`: the empty/welcome state centers again. The viewport's
standalone `height: 100%` (for the scroll chain) was defeating `flex-grow: 0`, so the composer
couldn't center; it's released only while empty.
