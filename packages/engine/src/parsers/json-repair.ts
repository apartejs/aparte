/**
 * Safe JSON parsing with light repair for small-LLM output noise.
 *
 * Many small / quantized models emit syntactically invalid JSON despite strong
 * "JSON only" instructions:
 *
 *   - `]]}` (duplicate `]`)
 *   - `}}` at the end
 *   - trailing commas before `]` or `}`
 *
 * We try a strict parse first, then progressively repair and retry.
 * Returns `null` if every attempt fails.
 */

export function safeJsonParse(input: string): unknown | null {
    const candidates = [
        input,
        repairTrailingCommas(input),
        repairDuplicateClosers(input),
        repairTrailingCommas(repairDuplicateClosers(input)),
    ];

    for (const c of candidates) {
        if (!c) continue;
        try { return JSON.parse(c); } catch { /* try next */ }
    }
    return null;
}

/**
 * Remove trailing commas before `]` or `}` (e.g. `[1,2,]` → `[1,2]`).
 *
 * Char-based scanner (no regex): walks the string, tracks whether we're inside
 * a JSON string literal (with escape handling) so commas inside strings are
 * never touched, and drops a comma only when the next non-whitespace char is
 * a closing `]` or `}`.
 */
function repairTrailingCommas(s: string): string {
    let out = '';
    let inString = false;
    let escape = false;

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];

        if (escape) { out += ch; escape = false; continue; }
        if (inString) {
            out += ch;
            if (ch === '\\') escape = true;
            else if (ch === '"') inString = false;
            continue;
        }

        if (ch === '"') { inString = true; out += ch; continue; }

        if (ch === ',') {
            // Look ahead past whitespace to see if next non-WS is `]` or `}`
            let j = i + 1;
            while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n' || s[j] === '\r')) j++;
            if (j < s.length && (s[j] === ']' || s[j] === '}')) {
                // Skip this comma — keep the whitespace so the closer stays well-placed
                continue;
            }
        }

        out += ch;
    }
    return out;
}

/**
 * Collapse runs of duplicate closing brackets that exceed the depth required
 * to balance the string. We compute the running depth based on `{[` openers
 * and skip extra `]`/`}` that would push depth below zero.
 */
function repairDuplicateClosers(s: string): string {
    let out = '';
    let curly = 0;
    let square = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];

        if (escape) { out += ch; escape = false; continue; }
        if (inString) {
            out += ch;
            if (ch === '\\') escape = true;
            else if (ch === '"') inString = false;
            continue;
        }

        if (ch === '"') { inString = true; out += ch; continue; }

        if (ch === '{') { curly++; out += ch; continue; }
        if (ch === '[') { square++; out += ch; continue; }
        if (ch === '}') {
            if (curly > 0) { curly--; out += ch; }
            // else: skip stray `}`
            continue;
        }
        if (ch === ']') {
            if (square > 0) { square--; out += ch; }
            // else: skip stray `]`
            continue;
        }
        out += ch;
    }
    return out;
}
