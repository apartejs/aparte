---
"@aparte/plugin-streaming-markdown": minor
---

Install `@paulrichez/streaming-markdown` in place of `streaming-markdown`: the plugin's peer dependency changed. Your code does not change.

```bash
npm install @paulrichez/streaming-markdown
npm uninstall streaming-markdown
```

`@paulrichez/streaming-markdown` is a maintained fork of Damian Tarnawski's `streaming-markdown`, which has had no release since 0.2.15 (May 2025). Same API, plus four fixes that show while a reply streams:

- A bracket inside a link's text no longer breaks the link: `[[1]](url)` and `[a [b] c](url)` render as links before the reply settles, not only after.
- Backticks in the middle of a line inside a code block no longer end the block early, as in ``function_call(```)``.
- A table or a blockquote inside a list item stays in the item, and a table's rows no longer show their indentation as text.
- An underscore inside a word is no longer emphasis: `snake_case_name` and `[read_me.md](url)` stay as written.
