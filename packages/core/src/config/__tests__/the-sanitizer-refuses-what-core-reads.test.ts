import { describe, it, expect, afterEach, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { coreRoot } from '../../__tests__/read-stylesheet';
import { defaultSanitizer as s, isReservedAttribute, RESERVED_ATTRIBUTES, RESERVED_ATTRIBUTE_PREFIXES } from '../sanitize';

/*
 * Model markup (through a Markdown provider) is text. Core reads a handful of attributes as
 * a command or a boundary on whatever element it finds by walking the DOM — a click on
 * `[data-aparte-dialog-open]` opens the app's dialog, `[data-aparte-chat]` is where a
 * card's `send` looks for its composer, `[data-checkpoint-action]` restores a checkpoint —
 * so the sanitizer, which keeps `data-*` for highlighters, must not keep those.
 */

const attrsOf = (html: string): string[] =>
    Array.from(new DOMParser().parseFromString(s(html), 'text/html').body.querySelectorAll('*'))
        .flatMap((el) => el.getAttributeNames());

describe('attributes core reads as a command or a boundary', () => {
    const forged = [
        'data-aparte-chat', 'data-aparte-host', 'data-aparte-theme',
        'data-aparte-dialog-open', 'data-aparte-dialog-close', 'data-aparte-dialog-static',
        'data-aparte-sidebar-toggle', 'data-aparte-sidebar-search',
        'data-aparte-split-pane', 'data-aparte-launcher-close', 'data-aparte-launcher-maximize', 'data-aparte-suggestions',
        'data-checkpoint-action', 'data-checkpoint-reason',
        'data-segment-id', 'data-action',
    ];

    for (const name of forged) {
        it(`drops ${name}`, () => {
            const out = s(`<span ${name}="x" data-line="3">text</span>`);
            expect(out).not.toContain(name);
            // …and only that one: the inert attributes a highlighter writes stay.
            expect(out).toContain('data-line="3"');
        });
    }

    it('drops them whatever the case they are written in', () => {
        expect(s('<span DATA-APARTE-DIALOG-OPEN="d">x</span>')).toBe('<span>x</span>');
    });

    it('keeps what a Markdown provider writes before the sanitizer runs', () => {
        // `data-aparte-open` marks a formula still arriving (marked's math, streaming-markdown),
        // and core marks `data-aparte-highlighted` on DOM it sanitizes again at settle.
        const out = s('<pre data-aparte-open><code data-aparte-highlighted data-aparte-open class="language-math">x</code></pre>');
        expect(out).toContain('<pre data-aparte-open="">');
        expect(out).toContain('data-aparte-highlighted=""');
    });

    it('is the same answer through the exported predicate', () => {
        for (const name of RESERVED_ATTRIBUTES) expect(isReservedAttribute(name)).toBe(true);
        for (const prefix of RESERVED_ATTRIBUTE_PREFIXES) expect(isReservedAttribute(`${prefix}anything`)).toBe(true);
        expect(isReservedAttribute('data-line')).toBe(false);
        expect(isReservedAttribute('data-aparte-open')).toBe(false);
    });
});

describe('role', () => {
    it('drops the roles that make an element a control', () => {
        for (const role of ['textbox', 'button', 'link', 'checkbox', 'switch', 'tab', 'combobox', 'searchbox', 'menuitem', 'dialog']) {
            expect(attrsOf(`<a href="https://example.com/login" role="${role}">this page</a>`)).not.toContain('role');
        }
    });

    it('drops a list of roles when one of them is a control', () => {
        expect(attrsOf('<span role="note textbox">x</span>')).not.toContain('role');
    });

    it('keeps the roles that only describe a document', () => {
        for (const role of ['note', 'figure', 'img', 'presentation', 'none', 'list', 'listitem', 'table', 'row', 'cell', 'heading', 'separator']) {
            expect(s(`<div role="${role}">x</div>`)).toContain(`role="${role}"`);
        }
        expect(s('<div role="NOTE">x</div>')).toContain('role="NOTE"');
    });
});

describe('<input>', () => {
    it('is dropped unless it is a checkbox', () => {
        for (const html of [
            '<input type="password" title="API key">',
            '<input type="text">',
            '<input type="email">',
            '<input type="file">',
            '<input type="hidden" value="x">',
            '<input type="submit" value="Send">',
            '<input type="radio">',
            '<input>',
            '<input title="API key">',
        ]) {
            expect(s(`<p>Paste your key: ${html}</p>`), html).toBe('<p>Paste your key: </p>');
        }
    });

    it('keeps a checkbox and makes it unclickable, whatever it said about it', () => {
        const check = (html: string): HTMLInputElement =>
            new DOMParser().parseFromString(s(html), 'text/html').querySelector('input') as HTMLInputElement;
        expect(check('<li><input type="checkbox"> todo</li>').disabled).toBe(true);
        expect(check('<li><input type="checkbox" checked> done</li>').checked).toBe(true);
        expect(check('<li><input type="checkbox" checked> done</li>').disabled).toBe(true);
        expect(check('<li><input type="CheckBox"> todo</li>').disabled).toBe(true);
    });

    it('writes the type back canonically, so a padded one is not a text box in a browser', () => {
        // A browser does not trim an enumerated attribute: `type="checkbox "` is invalid, so text.
        for (const type of ['checkbox ', ' checkbox', 'checkbox\t', 'CheckBox']) {
            const input = new DOMParser().parseFromString(s(`<li><input type="${type}"> todo</li>`), 'text/html').querySelector('input') as HTMLInputElement;
            expect(input.getAttribute('type'), JSON.stringify(type)).toBe('checkbox');
            expect(input.type, JSON.stringify(type)).toBe('checkbox');
            expect(input.disabled).toBe(true);
        }
    });

    describe('with no DOM parser (the Node/SSR net)', () => {
        afterEach(() => { vi.unstubAllGlobals(); });
        const noDom = (html: string): string => {
            vi.stubGlobal('DOMParser', undefined);
            return s(html);
        };

        it('drops every input here that is not a plain task-list checkbox, whatever its attributes say', () => {
            for (const html of [
                '<input type="password" title="API key">',
                '<input>',
                '<input title="type=checkbox" type="password">',
                '<input data-type=checkbox title="API key">',
                '<input type="checkbox-x">',
                '<input aria-label="a type=checkbox">',
            ]) {
                expect(noDom(`<p>${html}</p>`), html).not.toContain('<input');
            }
            // The one it keeps is rebuilt, so nothing the model spelled survives.
            expect(noDom('<p><input type="checkbox" checked></p>')).toBe('<p><input type="checkbox" checked disabled></p>');
            expect(noDom('<p><input type="checkbox" onclick="alert(1)" name=x id=composer autofocus form=f></p>')).toBe('<p><input type="checkbox" disabled></p>');
        });
    });
});

/*
 * The list is only as good as its last update. The attributes below are every
 * `data-aparte-*` / `data-checkpoint-*` name in core's own source; each is either reserved
 * (the model may not write it) or named here as state core writes itself, with the reason
 * it is safe for a model to write. A new attribute in core fails this until someone decides.
 */
describe('the list follows what core reads', () => {
    /** Written by core or a provider, read as a flag about content — not as a command or a boundary. */
    const STATE = new Set([
        'data-aparte-open',        // a provider marks a formula still arriving; settled content ignores it
        'data-aparte-highlighted', // "this block was highlighted": a forged one only skips highlighting it
        'data-aparte-hl-len',      // the streaming highlighter's own pane, never sanitized markup
        'data-aparte-tail',
        'data-aparte-bare',        // set on a drawing after the sanitizer ran; the drawings come off before it runs again
        'data-aparte-display',
        'data-aparte-drawn',
        'data-aparte-settled',     // the streaming highlighter's own pane (same as hl-len/tail), set on elements core builds
        'data-aparte-key',         // a cache key on the sources list core builds; a forged one only skips a re-render
        'data-aparte-image',       // a held picture's address: the image policy judges it again wherever it meets one, so a forged one gets what writing `src` gets
        'data-aparte-token',       // a pill in the composer's own field, which renders no Markdown
        'data-aparte-text',        // what that pill sends; same field
        'data-aparte-image-alt',   // a held picture's description, written back as text
    ]);

    const root = join(coreRoot(), 'src') + sep;
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
        if (name === '__tests__' || name === 'generated' || name === 'node_modules') return [];
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return files(path);
        return /\.(ts|css)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
    });

    it('has no attribute core mentions that is neither reserved nor known state', () => {
        const sources = files(root);
        // A scan that reads nothing would pass for the wrong reason.
        expect(sources.length).toBeGreaterThan(100);
        const found = new Map<string, string>();
        for (const file of sources) {
            const text = readFileSync(file, 'utf8');
            for (const [name] of text.matchAll(/data-(?:aparte|checkpoint)-[a-z0-9-]+/g)) {
                if (!found.has(name)) found.set(name, file.slice(root.length));
            }
            // The same attribute read through `dataset.aparteX` / `dataset['aparteX']` has no
            // hyphenated spelling in the source: convert it, or a command hides behind it.
            for (const [, key] of text.matchAll(/dataset(?:\.|\[['"])((?:aparte|checkpoint)[A-Z]\w*)/g)) {
                const name = 'data-' + key!.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
                if (!found.has(name)) found.set(name, file.slice(root.length));
            }
        }
        expect(found.size).toBeGreaterThan(20);
        const undecided = [...found].filter(([name]) => !isReservedAttribute(name) && !STATE.has(name));
        expect(undecided, 'decide each: add it to RESERVED_ATTRIBUTES (core reads it as a command or boundary) or to STATE here (a flag)').toEqual([]);
        // The other direction: a name listed here that core no longer uses is a stale line.
        for (const name of STATE) expect(found.has(name), `${name} is not in core any more`).toBe(true);
    });
});
