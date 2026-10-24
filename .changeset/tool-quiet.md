---
"@aparte/core": minor
---

`registerToolDisplay` takes `quiet`: the line a person reads, with a shimmer while the call runs and no "Done" once it is done.

The default row is an agent's: a spinner and "Running", then "✓ Done", and it stays the default. `quiet: true` drops the spinner and the word while the call runs (the label shimmers instead), and shows nothing once it succeeded: the label's tense says it, so give it one that reads the status ("Searching the web…" / "Searched the web" / a plain "Search the web" for the rest). A wait for approval, a refusal, a failure and a stop still show their word and note; the words a quiet row does not show are still read by a screen reader. The target is set in the chat's font and the chevron moves to the end of the line; the row carries `data-quiet`. Registering or dropping it redraws the rows on screen.
