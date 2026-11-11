---
'@aparte/core': minor
---

A segment of a type core does not know can now say what surrounds its content in the history sent back to the model: `wire: { before, after }`.

For a block grammar (`registerStreamBlock`): the model wrote `<note id="n1">…</note>` and used to read back the body alone, so it could not name the block again to change it. Set `wire` in `toSegment` and the model reads the tag it wrote:

```ts
toSegment: ({ attrs, id }) => ({
  id,
  type: 'note',
  content: '',
  wire: { before: `<note id="${id}">`, after: '</note>' },
}),
```

Without `wire` nothing changes: the content alone, as before. It is not read for `text` and `code`, which core serialises itself.
