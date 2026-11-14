---
'@aparte/plugin-streaming-markdown': patch
---

A streamed link opens where the chat's link target says: in a new tab by default, same-site ones included, as in the finished reply.

- The plugin asks `config.decideLink(href)` instead of keeping its own copy of core's external-link rule, so a link gets the same `target` and `rel` from the chunk its address arrives in to the settled reply, under `setLinkTarget('external-only')` too, and with the config the chat was set up with.
