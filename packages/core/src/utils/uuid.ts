/**
 * A unique id, in every context the library actually runs in.
 *
 * `crypto.randomUUID` is **secure-context only**. On `http://` — which includes
 * `http://192.168.1.x`, the archetypal deployment for this library's own audience
 * (bring-your-own-key, a local model on the LAN box) — it does not exist, and
 * calling it throws `TypeError: crypto.randomUUID is not a function`.
 *
 * That was not a theoretical edge. A cold audit found 27 call sites across ten
 * files and exactly TWO of them guarded, and the first thing to break was the
 * stream parser: `_generateId()` runs from `_createTextSegment`, so
 * `parser.parse('hello')` threw on the very first token of the very first reply.
 * The two guarded sites — `conversation-controller.ts` and
 * `files-to-attachments.ts` — prove the hazard was known and the sweep was never
 * finished. This is that sweep, in one place.
 *
 * The fallback is NOT cryptographic and does not need to be: these ids address
 * DOM nodes and map keys inside one page. Where a real UUID matters (a persisted
 * conversation id a consumer may treat as stable), `crypto.randomUUID` is still
 * used first, so a secure context gets the strong value.
 *
 * `pnpm check:secure-context` refuses a bare `crypto.randomUUID` anywhere but
 * here, so the sweep cannot come undone one call site at a time.
 */
export function uuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Enough entropy to not collide within a page, and cheap.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
