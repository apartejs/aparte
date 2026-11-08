---
'@aparte/core': patch
---

Enter now sends what is written in a question's text field or an approval's instruction; Shift+Enter starts a new line in the instruction. Nothing to change in your code.

**Who saw it:** anyone answering a panel from the keyboard. In an approval's "Or tell it what to do instead…", Enter added a line and sent nothing; in a question's text box or its "Other…" field, it did nothing. The composer's button was the only way out.

**Why:** a panel takes the editor's place, and the editor was the only thing listening for the key. The composer now listens on the panel too, and Enter there goes through `submit()`, so it follows the same gates as the button: nothing written, nothing sent; a panel put aside sends nothing.

`submit-on-enter="false"` swaps the keys here as it does in the editor. A multi-line answer (`multiline: true`) keeps Enter for its next line. A panel of your own passed to `showPanel()` gets the same behaviour on its one-line fields; a field that handles Enter itself and calls `preventDefault()`, such as a combobox, keeps the key.
