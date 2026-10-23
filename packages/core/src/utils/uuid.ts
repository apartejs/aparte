/**
 * A unique id, in every context the library actually runs in.
 *
 * `crypto.randomUUID` is **secure-context only**. On `http://` — which includes
 * `http://192.168.1.x`, the archetypal deployment for this library's own audience
 * (bring-your-own-key, a local model on the LAN box) — it does not exist, and
 * calling it throws `TypeError: crypto.randomUUID is not a function`.
 *
 * The fallback is NOT cryptographic and does not need to be: these ids address
 * DOM nodes and map keys inside one page. Where a real UUID matters (a persisted
 * conversation id a consumer may treat as stable), `crypto.randomUUID` is still
 * used first, so a secure context gets the strong value.
 */
export function uuid(): string {
    // In this repo, `pnpm check:secure-context` refuses a bare `crypto.randomUUID` anywhere but here.
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Enough entropy to not collide within a page, and cheap.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
