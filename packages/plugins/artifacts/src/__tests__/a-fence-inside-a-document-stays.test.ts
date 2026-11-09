/**
 * `stripCodeFences` takes off a fence a model put AROUND a document, and what it repeated
 * after that fence. A fence INSIDE the document is the document: the first version looked
 * for a closing fence whether or not one had been opened, so a Markdown report ended at its
 * first code block, on screen and in what Copy and Download gave back.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { getSegmentRenderer, aparteGlobalConfig } from '@aparte/core';
import { setupArtifacts } from '../index.js';
import { stripCodeFences } from '../shared.js';

const lines = (...parts: string[]): string => parts.join('\n');

describe('a fence inside a document', () => {
    it('keeps a Markdown report past its first code block', () => {
        const report = lines('# Report', '', 'Intro.', '', '```js', 'const a = 1;', '```', '', '## Conclusion', '', 'The end.');
        expect(stripCodeFences(report, 'markdown')).toBe(report);
    });

    it('keeps a script past a fence held in a string', () => {
        const script = lines('const sample = `', '```', 'text', '```', '`;', 'run(sample);');
        expect(stripCodeFences(script, 'js')).toBe(script);
    });

    it('keeps the blocks of a document wrapped in a fence of the same length', () => {
        const wrapped = lines('```markdown', '# Title', '', '```bash', 'npm i', '```', '', '## Next', '```');
        expect(stripCodeFences(wrapped, 'markdown')).toBe(lines('# Title', '', '```bash', 'npm i', '```', '', '## Next'));
    });

    it('does not close a long fence on a shorter one', () => {
        const wrapped = lines('````markdown', '# Title', '```', 'code', '```', '## Next', '````');
        expect(stripCodeFences(wrapped, 'markdown')).toBe(lines('# Title', '```', 'code', '```', '## Next'));
    });

    it('leaves a Markdown document that opens on a code block of its own', () => {
        const doc = lines('```js', 'const a = 1;', '```', '', '## Notes', '', 'Text.');
        expect(stripCodeFences(doc, 'markdown')).toBe(doc);
    });

    it('does not take a first line of inline code for a fence', () => {
        const doc = lines('```inline``` opens this line', '', 'More.');
        expect(stripCodeFences(doc, 'markdown')).toBe(doc);
    });
});

describe('a fence around a document', () => {
    it('comes off, with what a model repeated after it', () => {
        expect(stripCodeFences(lines('```html', '<p>x</p>', '```', '<p>x</p>'), 'html')).toBe('<p>x</p>');
    });

    it('comes off a Markdown document fenced as Markdown', () => {
        expect(stripCodeFences(lines('```md', '# Title', '```'), 'markdown')).toBe('# Title');
    });

    it('comes off while the closing fence has not arrived yet', () => {
        expect(stripCodeFences(lines('```html', '<p>x</p>'), 'html')).toBe('<p>x</p>');
    });
});

describe('the card', () => {
    let teardown: () => void;
    beforeEach(() => { teardown = setupArtifacts(); });
    afterEach(() => { teardown(); aparteGlobalConfig.reset(); });

    const drawn = (content: string): string => getSegmentRenderer('artifact')!.render({
        id: 'a1', type: 'artifact', mimeType: 'text/markdown', artifactType: 'markdown', content, isStreaming: false,
    } as never) as string;

    it('shows a Markdown report to its end', () => {
        expect(drawn(lines('# Report', '```js', 'const a = 1;', '```', '## Conclusion'))).toContain('## Conclusion');
    });

    it('tells the function it holds Markdown', () => {
        expect(drawn(lines('```js', 'const a = 1;', '```', '## Notes'))).toContain('## Notes');
    });

    const opensOnACodeBlock = lines('```js', 'const a = 1;', '```', '', '## Notes');

    const mounted = (content: string): HTMLElement => {
        const segment = { id: 'a1', type: 'artifact', mimeType: 'text/markdown', artifactType: 'markdown', content, isStreaming: false } as never;
        const renderer = getSegmentRenderer('artifact')!;
        const host = document.createElement('div');
        host.innerHTML = renderer.render(segment) as string;
        document.body.appendChild(host);
        const element = host.firstElementChild as HTMLElement;
        renderer.setup?.(element, segment);
        return element;
    };

    it('hands the whole Markdown document to Open', () => {
        teardown();
        teardown = setupArtifacts({ open: true });
        const opened: string[] = [];
        const listener = (e: Event): void => { opened.push((e as CustomEvent<{ artifact: { content: string } }>).detail.artifact.content); };
        document.addEventListener('aparte-artifact-open', listener);
        mounted(opensOnACodeBlock).querySelector<HTMLButtonElement>('[data-action="open"]')!.click();
        document.removeEventListener('aparte-artifact-open', listener);
        expect(opened).toEqual([opensOnACodeBlock]);
    });

    it('copies the whole Markdown document', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        try {
            mounted(opensOnACodeBlock).querySelector<HTMLButtonElement>('[data-action="copy"]')!.click();
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(writeText).toHaveBeenCalledWith(opensOnACodeBlock);
        } finally {
            Reflect.deleteProperty(navigator, 'clipboard');
        }
    });
});
