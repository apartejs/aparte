// @vitest-environment jsdom
/**
 * One response, one product — whichever loop is wired.
 *
 * `_meta.artifactHint` promotes the reply's first code fence to an artifact. The
 * streaming path applies it twice (as the fence closes, and again at finalize); the
 * NON-streaming path — a transport whose `chat()` resolves a plain string — applied it
 * never. So the same reply rendered `text | code | text` through core's inline loop and
 * `text | artifact | text` through the engine seam, decided by which transport happened
 * to be wired.
 *
 * The engine parity suite exists to catch exactly this and missed it, because it never
 * pairs a hint with a plain-string reply. This is that pair.
 */
import { describe, it, expect } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';

const REPLY = 'Here you go:\n\n```html\n<p>hi</p>\n```\n\nThat is it.';

function harness(withHint: boolean) {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
    } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    // A NON-streaming backend: `chat()` resolves a string rather than a stream.
    cfg.setTransport({ chat: async () => REPLY } as never);

    const el = document.createElement('div');
    const added: { type: string }[] = [];
    for (const m of ['updateMessage', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage']) {
        (el as unknown as Record<string, unknown>)[m] = () => {};
    }
    (el as unknown as Record<string, unknown>)['addSegment'] = (s: { type: string }) => { added.push(s); };

    const client = new AparteClient({
        config: cfg,
        autoRegister: false,
        ...(withHint
            ? {
                requestInterceptor: (r: Record<string, unknown>) => ({
                    ...r,
                    _meta: { ...(r['_meta'] as object ?? {}), artifactHint: { mimeType: 'text/html', kind: 'html' } },
                }),
            }
            : {}),
    } as never);

    return { client, el, added, cfg };
}

async function run(withHint: boolean) {
    const { client, el, added, cfg } = harness(withHint);
    await (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
        ._streamTurn(el, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');
    return added.map((s) => s.type);
}

describe('artifactHint on a NON-streaming reply', () => {
    it('promotes the code fence, exactly as the streaming path does', async () => {
        expect(await run(true)).toContain('artifact');
    });

    it('and leaves it a code segment when no hint was set', async () => {
        const types = await run(false);
        expect(types).toContain('code');
        expect(types, 'no hint, no promotion — the hint is the whole trigger').not.toContain('artifact');
    });
});
