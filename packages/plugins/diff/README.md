# @aparte/plugin-diff

A diff view for [aparté](https://github.com/apartejs/aparte): a file change as hunks with old and new line
numbers, in the reply or beside it, with comments on a line or a range.

```bash
npm install @aparte/plugin-diff @aparte/core
```

## The element

`<aparte-diff>` (`AparteDiff`) shows each file under a header with its path and its counts (`+3 −1`), each line
with its old and new numbers and a `+` or `−`, and the unchanged runs between hunks folded. Importing the
package defines it.

```html
<aparte-diff></aparte-diff>
<script type="module">
  import '@aparte/plugin-diff';

  const view = document.querySelector('aparte-diff');
  view.diff = { path: 'src/parse.ts', before: oldText, after: newText };
</script>
```

`diff` takes three shapes (`AparteDiffInput`):

- a unified diff's text, as `git diff` prints it — several files, new, deleted, renamed and binary ones included;
- a file's two texts, `{ path, before, after }` (`AparteDiffSource`, with `oldPath` for a rename): every
  unchanged line can then be shown, with a "Show 24 unchanged lines" button over each folded run;
- a list of files, each either of the above as data (`AparteDiffFile`) or two texts.

The lines are coloured by the chat's highlighter when one is installed (`@aparte/plugin-shiki`), in the
language the path's extension names; without one they are plain text. The code reads left to right in a
right-to-left page. A screen reader hears each `+` and `−` as "added" and "removed", and each file's counts in
words.

## Comments on a line

With `commentable`, a reader picks a line or a range and writes a comment on it. A click on a line number opens
a field under the line; Shift+click stretches the selection. From the keyboard, the numbers of a file are one tab
stop: the arrows move, Shift+arrows stretch, Enter or Space open the field, Escape lets go, Ctrl+Enter sends.
Without `commentable` nothing is clickable.

Sending fires `aparte-diff-comment` with `{ path, side, startLine, endLine, text, code }`
(`AparteDiffCommentEventDetail`; `side` is `'old'` for a removed line, `'new'` for the rest — `AparteDiffSide`).
The element keeps nothing: hand the comments back through `comments` (`AparteDiffComment`) and it shows them
under their lines, with their state.

```ts
const view = document.querySelector('aparte-diff')!;
view.commentable = true;
const review: AparteDiffComment[] = [];
view.addEventListener('aparte-diff-comment', (event) => {
  review.push({ ...event.detail, id: crypto.randomUUID(), state: 'pending' });
  view.comments = review;
});

// Later, all at once, as one message to the agent:
sendToAgent(review.map((c) => `${c.path}:${c.startLine}: ${c.text}`).join('\n'));
view.comments = review.map((c) => ({ ...c, state: 'sent' }));
```

Cancel the event (`event.preventDefault()`) to keep the field open with its text.

## A tool's result, in the reply

`setupDiff` shows an edit tool's result as a diff under the tool's line, opened. The row stays core's — the
label and summary you gave the tool, its states — and the diff takes the place of the raw Input and Output.

```ts
import { setupDiff } from '@aparte/plugin-diff';

const stop = setupDiff({
  tool: 'edit_file',
  map: (result, input) => ({ path: String(input.path), before: result.before, after: result.after }),
});
```

`DiffSetupOptions`: `tool` (a name, a pattern, or a list), `map` (the change from the tool's result and input;
without it the result must already be a diff), `commentable`, and `open` (`false` keeps it behind the line). The
config comes second, the global one by default. The call returns the function that takes it off.

## The computation

Plain functions with no DOM, in the browser and on a server:

```ts
import { diffTexts, formatUnifiedDiff, parseUnifiedDiff } from '@aparte/plugin-diff';

const before = 'let total = 0;\ntotal += parseInt(amount, 10);\n';
const after = 'let total = 0;\ntotal += Number(amount);\n';
const file = diffTexts(before, after, { path: 'src/parse.ts', context: 3 }); // AparteDiffFile
const text = formatUnifiedDiff(file);   // what `git apply` takes
const files = parseUnifiedDiff(text);   // AparteDiffFile[]
```

`diffTexts` (`DiffTextsOptions`: `context`, `path`, `oldPath`) is a line diff written here — Myers' algorithm, the
fewest added and removed lines — with no dependency. Lines are compared without their endings, so a file saved
with Windows line endings reads the same; a last line that gains or loses its newline shows as changed. Two texts
with thousands of changes between them are shown as the changed block removed then added, which stays a true
account of the change without being the shortest one.

An `AparteDiffFile` is `{ path, oldPath?, status?, added, removed, hunks, binary? }` (`AparteDiffFileStatus`:
`modified`, `added`, `deleted`, `renamed`); each `AparteDiffHunk` has `oldStart`, `oldCount`, `newStart`,
`newCount`, an optional `section` (the function a hunk is in), and its `lines` (`AparteDiffLine`: `kind` —
`AparteDiffLineKind`, `context`, `add` or `del` — `text`, `oldLine`, `newLine`, `noNewline`).

## Words and theme

Its words are in the ten languages `@aparte/locales` ships, in the chat's language; change one with
`extendLocale({ diffCommentSubmit: 'Send' })`. The tints are tokens that fall back to core's:
`--aparte-diff-added-bg` (`--aparte-success-surface`), `--aparte-diff-removed-bg` (`--aparte-error-surface`),
`--aparte-diff-added-ink`, `--aparte-diff-removed-ink` and `--aparte-diff-selected-bg`.

Documentation: [apartejs.dev/components/diff](https://apartejs.dev/components/diff/).

## License

MIT
