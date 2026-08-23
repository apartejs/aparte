#!/usr/bin/env node
/*
 * check-cross-refs — refuse a comment that cites another file by LINE NUMBER.
 *
 * Why this exists. Two modules in this repo are deliberate hand-maintained twins:
 * core's `client/xml-artifact-feed.ts` and engine's
 * `agent/parsers/artifact-xml-state-machine.ts`. Core cannot import engine's copy
 * (engine peer-depends on core), so the only thing keeping them in step is that
 * each names the other — and "a fix applied to one twin and not the other" is this
 * repo's single most repeated bug.
 *
 * For a while they cited each other by line number into a 2324-line module. When
 * that was measured, FOUR of six citations had rotted onto unrelated code:
 * `:1658-1669`, sold as "the finalize block", was a tool handler's AbortController;
 * `:1034-1042`, sold as "_streamLoop's leading writes", was `_handleSend` resolving
 * auth. One of the wrong ones was published to readers in `reference/engine.md`.
 *
 * A line number is a pointer with no type. Every edit above it silently
 * invalidates it, nothing checks it, and a reader who follows it lands on
 * plausible-looking unrelated code and believes it. So: cite a file, a function,
 * an exported name, or a section banner — anything the language or a grep can
 * still find after the file moves.
 *
 * Scope: comments in `packages/ * /src/ ** / *.ts`. A line number inside a URL is
 * fine (GitHub permalinks are pinned to a commit, so they do not rot); so is a
 * port, a duration and a pixel value.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const FILES = globSync('packages/*/src/**/*.ts', { exclude: (p) => p.includes('node_modules') || p.includes('/dist/') })
    .concat(globSync('packages/*/*/src/**/*.ts', { exclude: (p) => p.includes('node_modules') || p.includes('/dist/') }))
    .concat(globSync('packages/*/*/*/src/**/*.ts', { exclude: (p) => p.includes('node_modules') || p.includes('/dist/') }));

/*
 * The shapes that rot. Each must be a citation, not any colon followed by digits:
 *   `foo.ts:1268`  ·  `foo.ts :1268-1392`  ·  `(:1658-1669)`  ·  `_streamLoop :1300`
 * Two digits is the floor — `:8` and `:80` are ports and array indices far more
 * often than they are line numbers.
 */
const CITATION_SHAPES = [
    { re: /\.ts\s*:\s*\d{2,}/, what: 'a .ts filename followed by a line number' },
    { re: /\(\s*:\s*\d{2,}/, what: 'a parenthesised bare line number' },
    { re: /\s:\d{2,}\s*-\s*\d{2,}/, what: 'a bare line range' },
];

/** The comment text of a file, as {line, text} — nothing else is inspected. */
function comments(src) {
    const out = [];
    const lines = src.split('\n');
    let inBlock = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let text = '';
        if (inBlock) {
            const end = line.indexOf('*/');
            text = end === -1 ? line : line.slice(0, end);
            if (end !== -1) inBlock = false;
        } else {
            const block = line.indexOf('/*');
            const slash = line.indexOf('//');
            if (block !== -1 && (slash === -1 || block < slash)) {
                const end = line.indexOf('*/', block + 2);
                if (end === -1) { inBlock = true; text = line.slice(block + 2); }
                else text = line.slice(block + 2, end);
            } else if (slash !== -1) {
                text = line.slice(slash + 2);
            }
        }
        if (text.trim()) out.push({ line: i + 1, text });
    }
    return out;
}

/*
 * A guard that must find NOTHING is the easiest kind to break silently: if the
 * comment extractor stops working, it prints a clean bill of health for a repo it
 * never read. `check-attr-escaping` learned this the hard way and grew a floor on
 * the number of sites it SAW; same idea here, on comment lines scanned.
 *
 * The floor is the measurement minus ~5%, not a round number well below it. Set at
 * 4000 it did not bite: disabling `//` detection entirely still left 6480 block-
 * comment lines, which sailed through. A floor that a broken matcher can clear is
 * a comment. Measured 10549 when this was written.
 */
const SCANNED_FLOOR = 10000;

let scanned = 0;
const offenders = [];
for (const file of FILES) {
    for (const c of comments(readFileSync(file, 'utf8'))) {
        scanned++;
        // A GitHub permalink pins a commit, so its `#L209` cannot rot.
        if (/https?:\/\//.test(c.text)) continue;
        for (const shape of CITATION_SHAPES) {
            if (shape.re.test(c.text)) {
                offenders.push({ file, line: c.line, what: shape.what, text: c.text.trim().slice(0, 110) });
                break;
            }
        }
    }
}

if (scanned < SCANNED_FLOOR) {
    console.error(`FAIL: only ${scanned} comment lines scanned across ${FILES.length} files (floor ${SCANNED_FLOOR}).`);
    console.error('A collapsed count means the comment extractor is broken, not that the repo got tidy.');
    process.exit(1);
}

if (offenders.length) {
    console.error(`FAIL: ${offenders.length} comment(s) cite code by line number.\n`);
    for (const o of offenders) {
        console.error(`  ${o.file}:${o.line}  — ${o.what}`);
        console.error(`      ${o.text}`);
    }
    console.error('\nA line number is invalidated by every edit above it, and nothing checks it.');
    console.error('Four of six such citations in this repo had rotted onto unrelated code before');
    console.error('this guard existed — one of them published in the docs. Cite a filename, an');
    console.error('exported name, a function or a section banner instead.');
    process.exit(1);
}

console.log(`OK: ${scanned} comment lines across ${FILES.length} files, no line-number citations.`);
