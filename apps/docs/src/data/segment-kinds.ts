/**
 * The kinds of content one turn can hold — ONE copy, and one count.
 *
 * It lived in `pages/index.astro` while the NUMBER of them was written out by hand
 * in six places: the hero, the numbered claim beside it, a design note in that same
 * file's header, and three strings in `landing-meta.ts` (the meta description, the
 * `og:image:alt`, and the body baked into the social card's PNG).
 *
 * The hero said "ten" over a list of eight. `landing-meta.ts` already exists because
 * copies of this SENTENCE drifted — its own docblock says they went out of step
 * twice in one afternoon — so it centralised the sentence and left the number inside
 * it duplicated. Same defect, one level down. The count is derived from this array
 * now, everywhere, so removing a kind updates the page that sells it.
 */
export interface Kind { tag: string; body: string; states: string[] }

export const SEGMENT_KINDS: Kind[] = [
  { tag: 'text', body: 'Streamed token by token. Markdown and highlighting are plugins you opt into, so the core stays dependency-free.', states: [] },
  { tag: 'thinking', body: 'A collapsible block that closes itself the moment the model stops thinking — not when the answer ends.', states: [] },
  { tag: 'code', body: 'A fenced block with a copy button that copies the source, not the markup.', states: [] },
  { tag: 'tool_call', body: 'Five states, including a turn paused for a person — the row is the anchor, the decision is asked at the composer. It opens onto the arguments the model sent and the result your handler returned.', states: ['pending', 'awaiting-approval', 'resolved', 'rejected', 'aborted'] },
  { tag: 'error', body: 'A failure card inside the turn that produced it — not a toast somewhere else on the page.', states: [] },
  { tag: 'artifact', body: 'A plugin\'s segment, not core\'s — tabbed Code / Preview from @aparte/plugin-artifacts. The preview runs in a sandboxed iframe, and only ever after a person presses Preview.', states: [] },
];
