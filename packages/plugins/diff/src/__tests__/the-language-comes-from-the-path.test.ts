/**
 * A file is highlighted in the language its path names, and a highlighter that fails leaves
 * it plain.
 *
 * The extension is what an agent's file has, and highlighters know languages by their names
 * (`typescript`, `python`), not always by an extension. A file named for its tool
 * (`Dockerfile`) has none.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { highlightLines, languageOfPath } from '../highlight.js';
import { flush, mount } from './harness.js';

afterEach(() => {
    document.body.replaceChildren();
    aparteGlobalConfig.reset();
    vi.restoreAllMocks();
});

describe('the language of a path', () => {
    it.each([
        ['src/parse.ts', 'typescript'], ['app.tsx', 'tsx'], ['lib/index.mjs', 'javascript'], ['README.md', 'markdown'],
        ['tools/run.py', 'python'], ['main.rs', 'rust'], ['deploy.sh', 'shellscript'], ['ci.yml', 'yaml'],
        ['styles/site.css', 'css'], ['data.json', 'json'], ['Dockerfile', 'dockerfile'], ['src/Makefile', 'make'],
        ['notes', ''], ['.env', ''], ['fix.patch', 'diff'], ['page.svelte', 'svelte'],
    ])('reads %s as %s', (path, language) => {
        expect(languageOfPath(path)).toBe(language);
    });
});

describe('highlighting', () => {
    it('leaves the lines plain when the highlighter throws', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        aparteGlobalConfig.setHighlightProvider(() => {
            throw new Error('no grammar');
        });
        expect(await highlightLines(aparteGlobalConfig, ['a', 'b'], 'typescript')).toBeNull();
        const el = mount({ path: 'x.ts', before: 'a\n', after: 'b\n' });
        await flush();
        await flush();
        expect([...el.querySelectorAll('.aparte-diff-line__code')].map((c) => c.innerHTML)).toEqual(['a', 'b']);
    });

    it('asks for plain text when the path names no language, and asks nothing for no line', async () => {
        const asked: string[] = [];
        aparteGlobalConfig.setHighlightProvider((code, lang) => {
            asked.push(lang);
            return `<pre><code>${code.split('\n').map((l) => `<span class="line">${l}</span>`).join('\n')}</code></pre>`;
        });
        expect(await highlightLines(aparteGlobalConfig, [], 'typescript')).toBeNull();
        expect(await highlightLines(aparteGlobalConfig, ['x'], '')).toEqual({ lines: ['x'], className: '' });
        expect(asked).toEqual(['text']);
    });
});
