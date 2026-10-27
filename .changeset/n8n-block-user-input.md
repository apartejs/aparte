---
"@aparte/runner-n8n": patch
---

n8n's "Block User Input" is now honoured: a Chat node's buttons are asked without a field to write in when it is on.

Without it, the person may still write instead of choosing, which n8n reads as a message and takes as not approved, as with its own widget.
