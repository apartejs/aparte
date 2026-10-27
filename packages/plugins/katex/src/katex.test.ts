/**
 * The KaTeX renderer, on the real KaTeX: what it draws, what it refuses to let a model
 * write, and how it behaves while a formula is still arriving.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import katex from 'katex';
import { aparteGlobalConfig, renderCodeLanguages, type AparteCodeLanguageContext } from '@aparte/core';
import { setupKatexWith } from './core.js';
import { setupKatex } from './index.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function ctx(source: string, over: Partial<AparteCodeLanguageContext> = {}): AparteCodeLanguageContext {
    return { language: 'math', source, display: false, open: false, host: document.createElement('code'), config: aparteGlobalConfig, ...over };
}

const renderer = () => aparteGlobalConfig.getCodeLanguageRenderer('math')!;

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('drawing maths with KaTeX', () => {
    it('draws a formula beside its placeholder, as HTML and as MathML', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        setupKatexWith(katex);
        const root = document.createElement('div');
        root.innerHTML = '<p>so <code class="language-math math-inline">\\frac{1}{2}</code></p>';
        document.body.appendChild(root);
        renderCodeLanguages(root);
        expect(root.querySelector('.aparte-code-drawing .katex')).not.toBeNull();
        expect(root.querySelector('.aparte-code-drawing math')).not.toBeNull();
        expect(root.querySelector('code.language-math')!.textContent).toBe('\\frac{1}{2}');
    });

    it('draws display maths in display mode', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        setupKatexWith(katex);
        expect(renderer().render(ctx('x^2', { display: true })) as string).toContain('katex-display');
    });

    it('never lets a formula carry a link or run an HTML command', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        setupKatexWith(katex, { katex: { trust: true } });
        const el = document.createElement('div');
        el.innerHTML = renderer().render(ctx('\\href{javascript:alert(1)}{x} \\htmlClass{aparte-btn}{y}')) as string;
        // The TeX itself stays readable (MathML keeps it as an annotation); what it asked
        // for does not happen.
        expect(el.querySelector('a[href]')).toBeNull();
        expect(el.querySelector('.aparte-btn')).toBeNull();
    });

    it('keeps a macro defined in one formula out of the next', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        setupKatexWith(katex);
        renderer().render(ctx('\\gdef\\leak{X} 1'));
        expect(renderer().render(ctx('\\leak')) as string).toContain('aparte-code-error');
    });

    it('caps how large a formula may draw', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        setupKatexWith(katex, { katex: { maxSize: 1000 } });
        // \rule draws a box of the size it is asked; the cap keeps it within the chat.
        const el = document.createElement('div');
        el.innerHTML = renderer().render(ctx('\\rule{500em}{500em}')) as string;
        const styles = Array.from(el.querySelectorAll<HTMLElement>('[style]')).map((n) => n.getAttribute('style')).join(';');
        expect(styles).not.toMatch(/500em/);
        expect(styles).toMatch(/10em/);
    });

    it('shows the TeX, quietly, for a formula that does not parse once closed', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        setupKatexWith(katex);
        const html = renderer().render(ctx('\\frac{1}{')) as string;
        expect(html).toContain('class="aparte-code-error"');
        expect(html).toContain('\\frac{1}{');
    });

    it('shows a formula past the length cap as TeX', () => {
        setupKatexWith(katex, { maxLength: 10 });
        expect(renderer().render(ctx('x + y + z + w + v'))).toContain('aparte-code-error');
    });

    it('warns once when KaTeX\'s stylesheet is missing', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setupKatexWith(katex);
        renderer().render(ctx('a'));
        renderer().render(ctx('b'));
        await flush();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toContain('katex.min.css');
    });
});

describe('a formula still arriving', () => {
    it('answers null while it does not parse, so the last drawing stays', () => {
        setupKatexWith(katex);
        expect(renderer().render(ctx('\\frac{1}{', { open: true }))).toBeNull();
    });

    /** A formula inside one reply part, the way the engine hands it over. */
    function inPart(part: HTMLElement): (source: string) => AparteCodeLanguageContext {
        return (source) => {
            const host = document.createElement('code');
            part.replaceChildren(host);
            return ctx(source, { open: true, host });
        };
    }
    const part = (): HTMLElement => {
        const el = document.createElement('div');
        el.setAttribute('data-segment-id', 's1');
        document.body.appendChild(el);
        return el;
    };

    it('draws it while it parses, at most once a frame, and the last source always', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.useFakeTimers();
        setupKatexWith(katex);
        const at = inPart(part());
        expect(renderer().render(at('x + 1'))).toContain('katex');
        // Inside the wait: the next turn draws the latest source — never nothing.
        const superseded = renderer().render(at('x + 12'));
        const latest = renderer().render(at('x + 123'));
        await vi.advanceTimersByTimeAsync(20);
        expect(await superseded).toBeNull();
        expect(await latest).toContain('katex');
        expect(await latest).toContain('123');
        vi.useRealTimers();
    });

    it('paces each reply part on its own, so one stream cannot starve another', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        setupKatexWith(katex);
        const a = inPart(part());
        const b = inPart(part());
        expect(renderer().render(a('a + 1'))).toContain('katex');
        expect(renderer().render(b('b + 1'))).toContain('katex');
    });

    it('waits for the closed formula when live drawing is off', () => {
        setupKatexWith(katex, { live: false });
        expect(renderer().render(ctx('x', { open: true }))).toBeNull();
    });
});

describe('loading KaTeX', () => {
    it('loads it on the first formula, and draws once it is there', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const load = vi.fn(() => Promise.resolve(katex));
        setupKatexWith(load);
        expect(load).not.toHaveBeenCalled();
        const html = await renderer().render(ctx('a'));
        expect(load).toHaveBeenCalledTimes(1);
        expect(html).toContain('katex');
    });

    it('tries again after a load that failed', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const load = vi.fn()
            .mockImplementationOnce(() => Promise.reject(new Error('offline')))
            .mockImplementation(() => Promise.resolve(katex));
        setupKatexWith(load);
        await expect(renderer().render(ctx('a'))).rejects.toThrow('offline');
        expect(await renderer().render(ctx('a'))).toContain('katex');
    });

    it('draws a formula still arriving once KaTeX is there, and loads it once', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        let arrive!: (k: typeof katex) => void;
        const load = vi.fn(() => new Promise<typeof katex>((res) => { arrive = res; }));
        setupKatexWith(load);
        const first = renderer().render(ctx('x^2', { open: true }));
        const others = [1, 2, 3].map((n) => renderer().render(ctx(`y_${n}`)));
        expect(load).toHaveBeenCalledTimes(1);
        arrive(katex);
        expect(await first).toContain('katex');
        for (const other of others) expect(await other).toContain('katex');
    });

    it('imports katex itself from the package entry', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const dispose = setupKatex();
        expect(await renderer().render(ctx('a^2'))).toContain('katex');
        dispose();
        expect(aparteGlobalConfig.hasCodeLanguageRenderer('math')).toBe(false);
    });
});
