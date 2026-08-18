---
"@aparte/core": minor
---

New `fileInjectFilter` on `AparteClientOptions`: a per-file veto on top of the
`rawFileInject` mode. Called for each attached file the mode would inline into
the request; return `false` to keep it out (the file still rides on the
`aparte-send` event for the application layer). Lets a host keep the default
inline UX while blocking sensitive names (`.env`, keys, certs).
