---
'@aparte-workspace/docs': patch
---

Fixed: every live preview on the published docs showed "apartejs.dev refused to connect".

`nginx.docs.conf` sent `frame-ancestors 'none'` and `X-Frame-Options: DENY`, which forbid
the page from being framed by anyone — its own parent included. The docs site frames
itself: every preview is an `<iframe>` pointing at `/preview/*`, which is the whole
mechanism, so core's light DOM is not restyled by the site around it and a responsive
frame gets a viewport of its own. The two halves of the policy disagreed with each other:
`frame-src 'self'` let the parent embed, `frame-ancestors 'none'` forbade the child from
being embedded.

It never showed in development, where nothing adds these headers.

Now `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`. Clickjacking from another
origin is still refused, which is what the headers are for.
