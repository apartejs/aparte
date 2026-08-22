import { describe, it, expect } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';

/**
 * The XML artifact open tag arriving across two deltas.
 *
 * `<` and `artifact` are separate tokens in most vocabularies, so a provider
 * routinely ends a delta mid-tag. `indexOf('<artifact')` missed that: the whole
 * delta left as chat text, the feeder never entered `scanning`, and the artifact
 * was produced by the fallback path — which dispatches no artifact lifecycle at
 * all. Whether a consumer's artifact preview worked depended on where the
 * tokenizer happened to cut.
 *
 * Core has its own copy of this feeder (it cannot import engine's — engine
 * depends on core), so the same case is asserted on both sides.
 */
function drive(deltas: string[]) {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
    } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    cfg.setTransport({
        chat: () => new ReadableStream({
            start(controller) {
                for (const d of deltas) controller.enqueue({ type: 'text', delta: d });
                controller.enqueue({ type: 'done' });
                controller.close();
            },
        }),
    } as never);

    const el = document.createElement('div');
    const segments: { id: string; type: string; content?: string }[] = [];
    const lifecycle: string[] = [];
    const appended: string[] = [];
    Object.assign(el, {
        updateMessage: () => {},
        setUsage: () => {},
        addSegment: (s: { id: string; type: string; content?: string }) => { segments.push(s); },
        updateSegment: (id: string, u: { content?: string }) => {
            const s = segments.find(x => x.id === id);
            if (s && u.content !== undefined) s.content = u.content;
        },
        typeName: (t: string) => { appended.push(t); },
        updateLastMessage: (t: string) => { appended.push(t); },
    });
    for (const n of ['aparte-artifact-start', 'aparte-artifact-ready']) {
        el.addEventListener(n, () => lifecycle.push(n));
    }

    const client = new AparteClient({ config: cfg, autoRegister: false });
    const req = {
        messages: [{ role: 'user', content: 'hi' }],
        modelId: 'm',
        stream: true,
        _meta: { artifactXml: { mimeType: 'text/plain', kind: 'text' } },
    };
    return (client as unknown as { _streamLoop: (...a: unknown[]) => Promise<unknown> })
        ._streamLoop(el, 'assistant-1', cfg.getAIProvider('mock'), req, 'k')
        .then(() => ({ segments, lifecycle, appended: appended.join('') }));
}

const TAG = '<artifact mimeType="text/html" title="T">';

describe('AparteClient — the XML artifact tag arrives split', () => {
    it('opens the artifact and dispatches its lifecycle either way', async () => {
        const whole = await drive(['Sure!', TAG, '<h1>x</h1>', '</artifact>']);
        const split = await drive(['Sure!', '<arti', TAG.slice(5), '<h1>x</h1>', '</artifact>']);

        expect(whole.lifecycle).toEqual(['aparte-artifact-start', 'aparte-artifact-ready']);
        expect(
            split.lifecycle,
            'a tag split across deltas produced no artifact lifecycle at all',
        ).toEqual(whole.lifecycle);

        expect(split.segments.filter(s => s.type === 'artifact')).toHaveLength(1);
        expect(split.appended, 'the raw tag leaked into the message body').not.toContain('<arti');
    });

    it('does not swallow a tag that merely starts the same way', async () => {
        const out = await drive(['See the <article> element']);
        expect(out.segments.filter(s => s.type === 'artifact')).toHaveLength(0);
        const text = out.segments.map(s => s.content ?? '').join('') + out.appended;
        expect(text).toContain('<article>');
    });
});
