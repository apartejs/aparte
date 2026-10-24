---
"@aparte/core": minor
---

`registerToolDisplay` takes `details`: `false` for the line alone, or a function that draws what is behind it in place of Input and Output.

Behind a tool row's line, core shows the arguments and the result, raw: a developer's view, and it stays the default. A chat for people had no way out of it but hiding the call or rewriting the whole row. `details: false` keeps core's line with no disclosure at all, so nothing raw is one click away; on `'*'` it covers every tool nothing more specific describes. A function returns what stands in for Input and Output under core's line, a list of sources for a search, say: an element, or a string inserted as HTML (escape what comes from the call, as in a tool renderer). It is called on every update of the call, and on a language switch, whose words are written into the nodes already there; `''` means nothing behind the line yet, and the row gets its disclosure once there is something. A function that throws costs the row its detail, never its line, and never brings the raw parts back.

`hidden` and a tool renderer keep their precedence. Registering or dropping `details` redraws the rows already on screen, as `hidden` and `open` do. New type: `AparteToolDetails`.
