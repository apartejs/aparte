---
'@aparte/core': minor
---

Add `composer.setAttachmentState(file, { status, progress })`: a bar on the tile while a file uploads, for an app that uploads as soon as a file is picked.

While a file is `uploading` the composer holds the send and wears `data-uploading`. `{ status: 'error' }` marks the tile.
