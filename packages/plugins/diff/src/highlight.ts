/**
 * Colour a file's lines with the chat's highlighter, when one is installed.
 *
 * A highlighter colours a whole text, because what a line means depends on the lines above
 * it (a comment opened two lines up, a string that runs on). So each side of the change is
 * highlighted once, as one text, and cut back into lines: Shiki and the highlighters that
 * follow it wrap each line in `<span class="line">`. A highlighter that does not, or a
 * language it cannot read, leaves the lines as plain text.
 */
import type { AparteConfig } from '@aparte/core';

/** Extensions whose language goes by another name in a highlighter. */
const BY_EXTENSION: Record<string, string> = {
    ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
    md: 'markdown', markdown: 'markdown', mdx: 'mdx',
    py: 'python', rb: 'ruby', rs: 'rust', kt: 'kotlin', kts: 'kotlin',
    h: 'c', hpp: 'cpp', cc: 'cpp', cxx: 'cpp', cs: 'csharp',
    sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', ps1: 'powershell',
    yml: 'yaml', htm: 'html', svg: 'xml', patch: 'diff',
};

/** Files known by their name rather than an extension. */
const BY_NAME: Record<string, string> = { dockerfile: 'dockerfile', makefile: 'make' };

/** The language of a file, from its path: `src/parse.ts` → `typescript`; `''` when there is none to read. */
export function languageOfPath(path: string): string {
    const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
    if (BY_NAME[name]) return BY_NAME[name]!;
    const dot = name.lastIndexOf('.');
    if (dot <= 0) return '';
    const extension = name.slice(dot + 1);
    return BY_EXTENSION[extension] ?? extension;
}

/** A side's lines as the highlighter coloured them, and the classes it put on its block. */
export interface HighlightedLines {
    /** One HTML string per line. */
    lines: string[];
    /**
     * The classes of the highlighter's `<pre>`: its stylesheet colours the tokens under them
     * (Shiki's light/dark pair reads `.shiki span`), so each line wears them too.
     */
    className: string;
}

/**
 * `lines` coloured as one text, cut back into one HTML string per line; `null` when there is
 * no highlighter, or what it returned cannot be cut line for line. The HTML went through the
 * config's sanitizer (`highlightCode` runs it).
 */
export async function highlightLines(config: AparteConfig, lines: readonly string[], language: string): Promise<HighlightedLines | null> {
    if (!lines.length || !config.hasHighlightProvider() || typeof document === 'undefined') return null;
    let html: string;
    try {
        html = await config.highlightCode(lines.join('\n'), language || 'text', { fallback: false });
    } catch {
        return null;
    }
    const box = document.createElement('div');
    box.innerHTML = html; // safe-text: highlightCode returns the config sanitizer's output
    const cut = box.querySelectorAll('.line');
    if (cut.length !== lines.length) return null;
    return { lines: [...cut].map((line) => line.innerHTML), className: box.querySelector('pre')?.className.trim() ?? '' };
}
