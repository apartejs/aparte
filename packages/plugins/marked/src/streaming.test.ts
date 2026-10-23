// @vitest-environment jsdom
/**
 * `setupMarkedStreamingProvider` formats a reply with marked WHILE it streams.
 *
 * What it promises, each pinned below: unclosed Markdown is completed before it is
 * parsed (remend), a link shows as a link from its first character, blocks already
 * written keep their DOM, everything goes through the config's sanitizer, and the
 * DOM at `end()` is exactly the one-shot render of the whole reply — the same
 * parser on both sides, so a finished reply does not jump.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AparteConfig, aparteGlobalConfig } from '@aparte/core';
import { setupMarkedStreamingProvider } from './streaming.js';

function streamInto(config: AparteConfig, chunks: string[]): { target: HTMLElement; end(): void } {
    const target = document.createElement('div');
    const renderer = config.createStreamingMarkdownRenderer(target);
    if (!renderer) throw new Error('no streaming renderer registered');
    for (const chunk of chunks) renderer.write(chunk);
    return { target, end: () => renderer.end() };
}

describe('setupMarkedStreamingProvider', () => {
    afterEach(() => {
        aparteGlobalConfig.reset();
    });

    it('registers marked for both the streaming and the finished render', () => {
        const config = new AparteConfig();
        setupMarkedStreamingProvider(undefined, config);

        expect(config.renderMarkdown('**a**')).toBe('<p><strong>a</strong></p>\n');
        expect(config.createStreamingMarkdownRenderer(document.createElement('div'))).not.toBeNull();
    });

    it('completes unclosed emphasis while it streams', () => {
        const config = new AparteConfig();
        setupMarkedStreamingProvider(undefined, config);

        const { target } = streamInto(config, ['a **bo', 'ld']);

        expect(target.querySelector('strong')?.textContent).toBe('bold');
        expect(target.textContent).not.toContain('*');
    });

    it('holds back a marker that opens with nothing after it yet', () => {
        const config = new AparteConfig();
        setupMarkedStreamingProvider(undefined, config);

        const target = document.createElement('div');
        const renderer = config.createStreamingMarkdownRenderer(target)!;
        for (const [chunk, shown] of [['I am a **', 'I am a'], ['scripted** model, *', 'I am a scripted model,'], ['really* `', 'I am a scripted model, really']]) {
            renderer.write(chunk);
            expect(target.textContent?.trim(), `after ${JSON.stringify(chunk)}`).toBe(shown);
        }
        expect(target.querySelector('strong')?.textContent).toBe('scripted');
        expect(target.querySelector('em')?.textContent).toBe('really');
    });

    it('shows a link from its first character, clickable once its URL is complete', () => {
        const config = new AparteConfig();
        setupMarkedStreamingProvider(undefined, config);

        const target = document.createElement('div');
        const renderer = config.createStreamingMarkdownRenderer(target)!;
        renderer.write('see [a [b] c](https://exa');

        const pending = target.querySelector('a');
        expect(pending?.textContent, 'the text, brackets and all').toBe('a [b] c');
        expect(pending?.hasAttribute('href'), 'no destination until the URL is complete').toBe(false);
        expect(target.innerHTML).not.toContain('streamdown:');

        renderer.write('mple.com/a)');
        expect(target.querySelector('a')?.getAttribute('href')).toBe('https://example.com/a');
    });

    it('drops the pending-link placeholder itself, whatever the sanitizer keeps', () => {
        const config = new AparteConfig();
        config.setHtmlSanitizer((html) => html);
        setupMarkedStreamingProvider(undefined, config);

        const { target } = streamInto(config, ['see [the docs](https://exa']);

        expect(target.querySelector('a')?.textContent).toBe('the docs');
        expect(target.innerHTML).not.toContain('streamdown:');
    });

    it('leaves out an image until its URL is complete', () => {
        const config = new AparteConfig();
        setupMarkedStreamingProvider(undefined, config);

        const target = document.createElement('div');
        const renderer = config.createStreamingMarkdownRenderer(target)!;
        renderer.write('a chart: ![revenue](https://example.com/ch');
        expect(target.querySelector('img')).toBeNull();

        renderer.write('art.png)');
        expect(target.querySelector('img')?.getAttribute('src')).toBe('https://example.com/chart.png');
    });

    it('keeps the DOM of a block already written', () => {
        const config = new AparteConfig();
        setupMarkedStreamingProvider(undefined, config);

        const target = document.createElement('div');
        const renderer = config.createStreamingMarkdownRenderer(target)!;
        renderer.write('First paragraph.\n\nSecond');
        const first = target.querySelector('p');

        renderer.write(' paragraph, **still');
        renderer.write(' going**.\n\n- a list');

        expect(target.querySelector('p'), 'the same node, so a selection in it survives').toBe(first);
        expect(target.querySelectorAll('p')).toHaveLength(2);
        expect(target.querySelector('li')?.textContent).toBe('a list');
    });

    it('ends on exactly the one-shot render of the whole reply', () => {
        const config = new AparteConfig();
        setupMarkedStreamingProvider(undefined, config);
        const reply = [
            '# Title\n\n',
            'Some **bold**, a [link [1]](https://example.com/a), `code` and snake_case_name.\n\n',
            '- one\n- two with _emphasis_\n\n',
            '| a | b |\n|:--|--:|\n| 1 | 2 |\n\n',
            '```ts\nconst x = 1;\n```\n\n',
            '> quoted\n\nLast line ',
        ].join('');

        const chunks = reply.match(/[\s\S]{1,3}/g)!;
        const { target, end } = streamInto(config, chunks);
        end();

        expect(target.innerHTML).toBe(config.renderMarkdown(reply));
    });

    it('sends every block through the config sanitizer while it streams', () => {
        const config = new AparteConfig();
        setupMarkedStreamingProvider(undefined, config);

        const { target } = streamInto(config, ['[x](javascript:alert(1)) <img src=x onerror=alert(1)>', '\n\nmore']);

        expect(target.innerHTML).not.toContain('javascript:');
        expect(target.innerHTML).not.toContain('onerror');
    });

    it('sends an external link to its own tab while it streams', () => {
        const config = new AparteConfig();
        setupMarkedStreamingProvider(undefined, config);

        const { target } = streamInto(config, ['[docs](https://example.com) and more']);

        const link = target.querySelector('a');
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.getAttribute('rel')).toContain('noopener');
    });

    it('applies the options to the streaming and the finished render alike', () => {
        const config = new AparteConfig();
        setupMarkedStreamingProvider({ breaks: true }, config);

        const { target } = streamInto(config, ['one\ntwo']);

        expect(target.innerHTML).toContain('<br');
        expect(config.renderMarkdown('one\ntwo')).toContain('<br');
    });

    it('registers on the config it is given, not the global one', () => {
        const config = new AparteConfig();
        setupMarkedStreamingProvider(undefined, config);

        expect(aparteGlobalConfig.createStreamingMarkdownRenderer(document.createElement('div'))).toBeNull();
    });
});
