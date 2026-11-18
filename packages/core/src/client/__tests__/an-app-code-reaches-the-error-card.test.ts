// @vitest-environment jsdom
/**
 * A server loop that ends a run with a code of its own (`engine-died`) must be able to say so
 * on the error card. The runner folds such a code into PROVIDER_ERROR, which the card can put in
 * the reader's language, and keeps the raw value in the error's `data`; the card used to see only
 * PROVIDER_ERROR, and once the reply was saved the app's code was gone. It now rides on the
 * segment as `appCode`, and the error renderer receives it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig, aparteGlobalConfig } from '../../config/index.js';
import { AparteError, AparteErrorCode } from '../../types/errors.js';
import { createAgentStreamRunner } from '../agent-runner.js';
import type { AparteStreamRunner } from '../stream-adapter.js';
import { errorRenderer } from '../../renderers/segments/error.js';
import type { AparteErrorSegment, AparteMessage, AparteSegment } from '../../types/index.js';

const ndjson = (...lines: object[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';

/** A chat that keeps its messages in an array, as the end-to-end suite does. */
function chat() {
    const messages: AparteMessage[] = [];
    const el = document.createElement('div');
    const last = () => messages[messages.length - 1]!;
    Object.assign(el, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => { const m = messages.find((x) => x.id === id); if (m) Object.assign(m, u); },
        addSegment: (s: AparteSegment) => { const m = last(); m.segments = [...(m.segments ?? []), s]; },
        updateSegment: () => {}, updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
        getMessages: () => messages,
    });
    document.body.appendChild(el);
    return { el, messages };
}

async function failWith(streamRunner: AparteStreamRunner) {
    const { el, messages } = chat();
    const cfg = new AparteConfig();
    cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never, streamRunner } as never);
    await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(new CustomEvent('aparte-send', { detail: { content: 'hi' } }));
    return messages.at(-1)?.segments?.find((s) => s.type === 'error') as AparteErrorSegment | undefined;
}

const endpointAnswering = (...lines: object[]) => createAgentStreamRunner({
    endpoint: '/api/agent',
    fetch: (async () => new Response(ndjson(...lines))) as unknown as typeof fetch,
});

afterEach(() => {
    aparteGlobalConfig.setErrorRenderer(null);
    document.body.innerHTML = '';
});

describe('an app\'s own run-error code', () => {
    it('rides on the error segment, beside the PROVIDER_ERROR the card speaks', async () => {
        const error = await failWith(endpointAnswering(
            { type: 'run-start' },
            { type: 'text', delta: 'Half an answer' },
            { type: 'run-error', message: 'The engine stopped.', code: 'engine-died' },
        ));
        expect(error).toMatchObject({ code: AparteErrorCode.PROVIDER_ERROR, appCode: 'engine-died' });
    });

    it('is not set for a code of aparté\'s own, which is the error\'s code already', async () => {
        const error = await failWith(endpointAnswering(
            { type: 'run-start' },
            { type: 'run-error', message: 'Slow down.', code: AparteErrorCode.USAGE_RATE_LIMIT },
        ));
        expect(error?.code).toBe(AparteErrorCode.USAGE_RATE_LIMIT);
        expect(error).not.toHaveProperty('appCode');
    });

    it('comes from any runner that keeps the raw code in data, as the AG-UI runner does', async () => {
        const error = await failWith(async () => {
            throw new AparteError('Model overloaded', AparteErrorCode.PROVIDER_ERROR, { agUi: 'run-error', code: 'overloaded' });
        });
        expect(error).toMatchObject({ code: AparteErrorCode.PROVIDER_ERROR, appCode: 'overloaded' });
    });

    it('reaches a custom error renderer, after the reply was saved and read back', async () => {
        const error = await failWith(endpointAnswering({ type: 'run-start' }, { type: 'run-error', message: 'x', code: 'engine-died' }));
        const saved = JSON.parse(JSON.stringify(error)) as AparteErrorSegment;
        const seen: unknown[] = [];
        aparteGlobalConfig.setErrorRenderer((ctx) => { seen.push(ctx); return '<p>custom</p>'; });
        errorRenderer.render(saved);
        expect(seen[0]).toMatchObject({ code: AparteErrorCode.PROVIDER_ERROR, appCode: 'engine-died' });
    });

    it('leaves the default card on the sentence of PROVIDER_ERROR, not the server\'s words', async () => {
        const error = await failWith(endpointAnswering({ type: 'run-start' }, { type: 'run-error', message: 'segfault at 0x0', code: 'engine-died' }));
        const html = errorRenderer.render(error!) as string;
        expect(html).not.toContain('segfault');
        expect(html).toContain(`data-error-code="${AparteErrorCode.PROVIDER_ERROR}"`);
    });
});
