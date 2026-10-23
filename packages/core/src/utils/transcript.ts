/**
 * Whether a transcript shows nothing: no message, and none on its way.
 *
 * A message is an `<aparte-chat-bubble>`. A viewport that says `loading` holds no bubble
 * yet and is still not empty, so the welcome and the centred composer stay hidden while a
 * conversation is being fetched.
 *
 * One predicate because two elements ask the question — `<aparte-chat>` for its
 * `data-empty`, `<aparte-suggestions empty-only>` for whether its starters still belong —
 * and the `loading` half is exactly the kind of clause a second copy forgets.
 */
export function isTranscriptEmpty(viewport: Element): boolean {
    return !viewport.hasAttribute('loading') && !viewport.querySelector('aparte-chat-bubble');
}
