/**
 * pythonic-parser.ts — Parse LFM2.5 native tool call format.
 *
 * Format Pythonic natif :
 *   <|tool_call_start|>[fn_name(arg1="value", arg2=42)]<|tool_call_end|>
 *
 * Fallback Hermes JSON :
 *   <tool_call>{"name": "fn_name", "arguments": {"arg1": "value"}}</tool_call>
 *
 * Pure logic, framework-free. Importable Node + browser.
 *
 * Source : adapté de `aparte-training/tests-node/lib/orchestrator.mjs::_parseToolCalls`
 * (validé 25/25 sur test_tool_call_parser.mjs).
 */

export interface ParsedToolCall {
    name: string;
    args: Record<string, unknown>;
}

/**
 * Extract all tool calls from a text response.
 * Tries Pythonic first (LFM2.5 native), falls back to Hermes JSON.
 *
 * @returns Array of {name, args}. Empty if no tool calls found.
 */
export function parseToolCalls(text: string): ParsedToolCall[] {
    if (!text) return [];

    // Try Pythonic format
    const pythonic = parsePythonic(text);
    if (pythonic.length > 0) return pythonic;

    // Fallback to Hermes JSON
    return parseHermes(text);
}

// ─── Pythonic parser ──────────────────────────────────────────────────

function parsePythonic(text: string): ParsedToolCall[] {
    const calls: ParsedToolCall[] = [];

    // Match the OPENING of a tool call : `<|tool_call_start|>[name(` (or `[name(` raw)
    // then walk char-by-char until we find the proper CLOSING `)]` boundary,
    // respecting strings (which may legitimately contain `)`, `]`, etc.).
    //
    // The simple regex `\[name\(([^)]*?)\)\]` from the previous implementation
    // fails on `[run_code(code="foo(1,2)")]` because it stops at the first `)`.
    // Tool names are canonical lowercase — keep this case-sensitive (no `i` flag)
    // so a mis-cased emission isn't silently captured as an unknown tool name.
    const opener = /(?:<\|tool_call_start\|>)?\[([a-z_][a-z0-9_]*)\(/gm;
    let openMatch;
    while ((openMatch = opener.exec(text)) !== null) {
        const name = openMatch[1];
        if (!name) continue;

        // Walk from the char after the opening `(` to find the matching `)]`.
        const argsStart = openMatch.index + openMatch[0].length;
        let i = argsStart;
        let inStr: null | '"' | "'" = null;
        let depth = 1;  // we're inside the opening `(`
        while (i < text.length) {
            const ch = text[i];
            const prev = i > 0 ? text[i - 1] : '';
            if (inStr) {
                if (ch === inStr && prev !== '\\') inStr = null;
            } else {
                if (ch === '"' || ch === "'") inStr = ch as '"' | "'";
                else if (ch === '(') depth++;
                else if (ch === ')') {
                    depth--;
                    if (depth === 0) {
                        // Expect `]` next, optionally followed by `<|tool_call_end|>` / `<|im_end|>` / EOF
                        if (text[i + 1] === ']') {
                            const argsStr = text.slice(argsStart, i);
                            const args = parsePythonicArgs(argsStr);
                            calls.push({ name, args });
                            // Advance the opener regex past this match
                            opener.lastIndex = i + 2;
                        }
                        break;
                    }
                }
            }
            i++;
        }
    }
    return calls;
}

function parsePythonicArgs(argsStr: string): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    // key=value, comma-separated. Values can be:
    //   "string", 'string', number, true/false, null
    const re = /(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(-?\d+\.?\d*)|(true|false|null)|([^,)]+))/g;
    let m;
    while ((m = re.exec(argsStr)) !== null) {
        const key = m[1];
        if (!key) continue;
        let value: unknown;
        if (m[2] !== undefined) value = unescapeJsonString(m[2]);
        else if (m[3] !== undefined) value = unescapeJsonString(m[3]);
        else if (m[4] !== undefined) value = Number(m[4]);
        else if (m[5] !== undefined) value = m[5] === 'true' ? true : m[5] === 'false' ? false : null;
        else value = (m[6] ?? '').trim();
        args[key] = value;
    }
    return args;
}

function unescapeJsonString(s: string): string {
    return s.replace(/\\(.)/g, (_, ch) => {
        if (ch === 'n') return '\n';
        if (ch === 't') return '\t';
        if (ch === 'r') return '\r';
        return ch;
    });
}

// ─── Hermes JSON parser (fallback) ────────────────────────────────────

function parseHermes(text: string): ParsedToolCall[] {
    const calls: ParsedToolCall[] = [];
    const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const body = (match[1] ?? '').trim();
        if (!body) continue;
        try {
            const parsed = JSON.parse(body);
            if (typeof parsed !== 'object' || parsed === null) continue;
            const name = String(parsed.name ?? '');
            if (!name) continue;
            // Args can be under "arguments" or "parameters", and may be a string-JSON or object
            let argsRaw = parsed.arguments ?? parsed.parameters ?? {};
            if (typeof argsRaw === 'string') {
                try { argsRaw = JSON.parse(argsRaw); } catch { argsRaw = {}; }
            }
            const args = (typeof argsRaw === 'object' && argsRaw !== null) ? argsRaw : {};
            calls.push({ name, args });
        } catch {
            // malformed Hermes JSON — skip
        }
    }
    return calls;
}
