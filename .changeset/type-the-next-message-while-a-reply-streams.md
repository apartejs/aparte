---
"@aparte/core": minor
---

The composer stays editable while a reply streams: the next message can be typed and files attached while the current reply arrives, as in every chat. Only the send is gated meanwhile — the button is Stop, and Enter neither sends nor stops (the draft stays and Enter sends it once the turn is over). Until now the editor and the attach button went inert for the whole turn. `disabled` still makes the editor non-editable (the `require-model` gate never did — it gates the send, and typing under it is what the browser suite checks), and a non-editable editor now leaves the tab order (`tabindex="-1"`) and drops focus, so clicking it no longer lights the shell's focus border on a field that cannot be typed in. A custom `<aparte-composer-action>` keeps its own rule (disabled while streaming), since its act is the host's.
