---
'@aparte/core': patch
---

`--aparte-avatar-image-user` and `--aparte-avatar-image-assistant` now show their picture with no avatar provider: set the token and the slot appears for that role.

An empty slot is hidden, so the token painted nothing unless a provider wrote something in the slot (the guide's `host.innerHTML = '<span></span>'` workaround, no longer needed). The bubble now marks an empty slot whose role's token names an image with `data-image`, read when the message is drawn and on every configuration change, and the hiding rule skips it. It also shows in a slot a provider leaves empty, for the role it does not draw.
