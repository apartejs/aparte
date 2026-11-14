---
'@aparte/plugin-diff': minor
---

New `@aparte/plugin-diff`: show a file change as hunks with line numbers, in the reply or beside it, and let the reader comment on a line.

```ts
import { setupDiff } from '@aparte/plugin-diff';

// An edit tool's result, as a diff under its line in the reply.
setupDiff({ tool: 'edit_file', map: (result, input) => ({ path: String(input.path), before: result.before, after: result.after }) });

// Beside the chat, open to comments.
const view = document.querySelector('aparte-diff')!;
view.commentable = true;
view.diff = unifiedDiffText; // or { path, before, after }, or a list of files
view.addEventListener('aparte-diff-comment', (e) => keep(e.detail)); // { path, side, startLine, endLine, text, code }
view.comments = kept; // shown under their lines, pending or sent
```

- **`<aparte-diff>`** shows each file under a header with its path, what happened to it (added, deleted, renamed) and its counts, which folds it; each line with its old and new numbers and a `+` or `−`, said as "added" and "removed" to a screen reader; the unchanged runs between hunks folded, with a "Show N unchanged lines" button when the whole text is known. The lines are coloured by the chat's highlighter when one is installed, in the language of the path's extension, and the code reads left to right in a right-to-left page.
- **Comments**, with `commentable`: a click on a line number opens a field of the kit under the line, Shift+click stretches the selection; from the keyboard the numbers are one tab stop, the arrows move, Shift+arrows stretch, Enter or Space opens the field, Escape lets go. Sending fires `aparte-diff-comment` (bubbling, cancelable). The element keeps nothing: the comments the app hands back through `comments` are shown under their lines with their state. Without `commentable`, nothing is clickable.
- **`setupDiff({ tool, map, commentable, open }, config?)`** puts the change behind an edit tool's line, opened, and keeps the row's label, summary and states. Each row has its own diff, kept through the call's updates and gone with the row. It returns the function that takes it off.
- **`diffTexts`, `parseUnifiedDiff`, `formatUnifiedDiff`** compute, read and write diffs with no DOM, from the server entry too. The line diff is Myers' algorithm, written in the package: no dependency; a large file is first cut at the lines it holds once on each side (patience anchoring), so 200,000 lines changed in a thousand places still give a thousand small hunks in well under a second. A side given as `null` is a file created or deleted, `''` an empty file. What `formatUnifiedDiff` writes, `git apply` takes (`new file mode`, `deleted file mode`, `rename from` / `rename to`); `parseUnifiedDiff` reads a rename only where git says one, so `diff -u x.c.orig x.c` is a change to `x.c`.
- Tints are tokens that fall back to core's (`--aparte-diff-added-bg` on `--aparte-success-surface`, `--aparte-diff-removed-bg` on `--aparte-error-surface`, and the inks); the words are in the ten languages `@aparte/locales` ships.
