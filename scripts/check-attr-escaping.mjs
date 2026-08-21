/**
 * Every interpolation in ATTRIBUTE position must be escaped — with the escaper
 * that matches the position.
 *
 * Why a gate rather than a review note: a cold audit found `data-role="${role}"`
 * twice and `data-status="${status}"` once, each sitting one line from a sibling
 * that WAS escaped. Fixing those three would have left the class alive. The sweep
 * that followed found 42 unescaped attribute interpolations across eight files —
 * and NINE private copies of the escaping helper, three of which had drifted to
 * escape four of the five characters that matter (the apostrophe went through,
 * which is enough to break out of a single-quoted attribute).
 *
 * Two positions, two escapers, and the difference is not cosmetic:
 *   - markup      → `escapeAttr` (entity-encodes, so the value cannot end early)
 *   - a selector  → `cssEscape` (backslash-escapes, so `querySelector` does not
 *                   throw or match the wrong node). This check writing the sweep
 *                   found a real instance: the host built a `[message-id="…"]`
 *                   selector from a raw id while its three siblings in the
 *                   viewport used cssEscape.
 *
 * An `attr="${expr}"` passes when:
 *   - it is in selector context and goes through `cssEscape`, or
 *   - it is in markup and goes through one of the escapers below, or is a local
 *     already assigned from one (`const escapedId = escapeHtml(id)`), or
 *   - `expr` is provably not attacker-shaped — a named boolean/number, a ternary
 *     between two string literals, a comparison, `String(...)`, `.toFixed(...)`, or
 *   - the line carries `// safe-attr: <reason>`, which makes the exemption
 *     explicit, greppable and reviewable instead of invisible.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOTS = ['packages/core/src', 'packages/plugins', 'packages/providers'];

/** Calls that produce a value safe to drop into markup. */
const ESCAPERS = [
    'escapeHtml(', 'escapeAttr(', 'cssEscape(', 'esc(',
    'encodeURIComponent(', 'escapeClosingScriptTag(',
];

/** Shapes that cannot carry an attacker-controlled string. */
const SAFE_SHAPES = [
    /^[\w$.]+\s*\?\s*'[^']*'\s*:\s*'[^']*'$/,
    /^String\(/,
    /^[\w$.]+\.toFixed\(/,
    /^[\w$.()]+\s*(===|!==|>=|<=|>|<)\s*[\w$.'"]+$/,
];

/**
 * Bare identifiers are only safe when they really are booleans or numbers, so
 * they are NAMED here rather than inferred from the spelling.
 */
const BOOLEANS_AND_NUMBERS = new Set([
    'visible', 'disabled', '!disabled', 'previewable', 'isStreaming', 'isBinary',
    'pct', 'this._r', 'dasharray', 'initialTab',
]);

const SELECTOR_CALL = /querySelector(?:All)?\(|\.matches\(|\.closest\(/;
const ATTR_INTERP = /([a-zA-Z-]+)="\$\{([^}]*)\}"/g;

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            if (['node_modules', 'dist', '__tests__'].includes(name)) continue;
            yield* walk(path);
        } else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
            yield path;
        }
    }
}

const offenders = [];
let checked = 0;
let selectors = 0;

for (const root of ROOTS) {
    for (const file of walk(root)) {
        const src = readFileSync(file, 'utf8');
        const lines = src.split('\n');
        const where = i => `${relative(process.cwd(), file).split(sep).join('/')}:${i + 1}`;

        // Locals already escaped upstream are safe at the call site, and the call
        // site is where the attribute is. Collected once per file so the check does
        // not demand a second escaping of an already-escaped value.
        const preEscaped = new Set(
            [...src.matchAll(/(?:const|let)\s+([\w$]+)\s*=\s*[^;\n]*(?:escapeHtml|escapeAttr|cssEscape|esc)\(/g)]
                .map(m => m[1]),
        );

        lines.forEach((line, i) => {
            if (line.includes('safe-attr:')) return;
            // The querySelector call can sit a line or two above the template, so
            // decide the position from a small window rather than the line alone.
            const isSelector = SELECTOR_CALL.test(lines.slice(Math.max(0, i - 2), i + 1).join(' '));

            for (const m of line.matchAll(ATTR_INTERP)) {
                checked++;
                const expr = m[2].trim();
                const site = `${where(i)}  ${m[1]}="\${${expr}}"`;

                if (isSelector) {
                    selectors++;
                    if (!expr.includes('cssEscape(')) {
                        offenders.push(`${site}  — selector: needs cssEscape, not escapeAttr`);
                    }
                    continue;
                }
                if (ESCAPERS.some(e => expr.includes(e))) continue;
                if (preEscaped.has(expr)) continue;
                if (SAFE_SHAPES.some(re => re.test(expr))) continue;
                if (BOOLEANS_AND_NUMBERS.has(expr)) continue;
                offenders.push(site);
            }
        });
    }
}

if (offenders.length) {
    console.error(`\n[attr-escaping] ${offenders.length} unescaped interpolation(s) of ${checked}:\n`);
    for (const o of offenders) console.error('  ' + o);
    console.error(
        "\nIn markup, wrap the value in escapeAttr() (exported from @aparte/core)."
        + "\nIn a selector, use cssEscape(). If the value genuinely cannot carry an"
        + "\nattacker-controlled string, add `// safe-attr: <reason>` to the line so"
        + "\nthe exemption is explicit.\n",
    );
    process.exit(1);
}

console.log(
    `[attr-escaping] OK: ${checked} attribute interpolations `
    + `(${selectors} in selector position), all escaped or explicitly exempt.`,
);
