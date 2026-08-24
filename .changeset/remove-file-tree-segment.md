---
'@aparte/core': minor
---

**Removed: the `file-tree` segment type.** Breaking, deliberately and without a shim.

`{ type: 'file-tree' }`, `AparteFileTreeSegment` and `AparteFileNode` are gone, with
their renderer, their styles and their fourteen `--aparte-file-tree-*` /
`--aparte-file-status-*` variables. Core ships nine segment kinds now, not ten.

It was in the wrong place, and every symptom of that was visible before anyone
noticed the cause:

- **No model emits a file tree.** The segment kinds core owns are what a model
  produces — prose, reasoning, a fenced block, a tool call, an artifact — plus what
  its own loop reports. A directory listing is neither: it is an app rendering the
  result of a tool it ran.
- **Nothing in the library produced one.** No parser, no client, no example, no
  browser test. A consumer had to hand-build the whole tree.
- **And it had drifted accordingly**: no locale keys and no icon-provider calls
  anywhere in it — its glyphs were literal emoji — so it was the one renderer a
  language change or an icon pack could never touch. That is what an unattended
  surface looks like.

**What to do instead.** A file list is the result of a tool, so it belongs to that
tool: register a renderer for it with `config.registerToolRenderer(name, renderer)`
and it draws inside the `tool_call` segment, which is where the model's request and
the result already live. `@aparte/plugin-ask-user` is that shape end to end if you
want a worked example. If you genuinely need a standalone block with no tool behind
it, `registerSegmentRenderer` still takes a type of your own — that path is
unchanged, and it is the one this type should have used from the start.

Nothing else in core referenced it, so there is no migration beyond deleting your own
`file-tree` segments or moving them behind one of those two seams.
