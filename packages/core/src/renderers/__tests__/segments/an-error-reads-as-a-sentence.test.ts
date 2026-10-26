/**
 * An error reads as a sentence chosen by its code, in the reader's language.
 *
 * The alert drew the raw message: a transport's or a vendor's text, in English, written for
 * a developer ("Failed to fetch", "429 Too Many Requests", a JSON body). A person on a
 * support widget read that. The sentence is now picked by the code, the message stays on
 * the segment for storage and a custom renderer, and the client puts it on the console.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import { AparteConfig } from '../../../config/aparte-config.js';
import { AparteClient } from '../../../client/aparte-client.js';
import '../../../components/viewport/aparte-chat-viewport.js';
import type { AparteErrorSegment, AparteMessage, AparteStreamEvent } from '../../../types/index.js';
import type { AparteTool } from '../../../types/tools.js';

registerDefaultRenderers();

const draw = (segment: AparteErrorSegment): HTMLElement => {
    const host = document.createElement('div');
    host.innerHTML = getSegmentRenderer('error')!.render(segment as never) as string;
    document.body.appendChild(host);
    return host.firstElementChild as HTMLElement;
};
const said = (el: HTMLElement): string => el.querySelector('.aparte-alert__message')!.textContent ?? '';
const error = (code: string | undefined, content = 'vendor said 503 {"error":"overloaded"}'): AparteErrorSegment =>
    ({ id: 'e1', type: 'error', content, ...(code !== undefined ? { code } : {}) }) as AparteErrorSegment;

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
    vi.restoreAllMocks();
});

describe('the sentence an error code reads as', () => {
    it.each([
        ['NET_OFFLINE', 'The assistant can’t be reached right now. Try again in a moment.'],
        ['NET_ERROR', 'The assistant can’t be reached right now. Try again in a moment.'],
        ['NET_TIMEOUT', 'The answer took too long. Try again in a moment.'],
        ['CONFIG_INVALID_KEY', 'The assistant isn’t allowed to answer right now.'],
        ['USAGE_RATE_LIMIT', 'Too many requests right now. Try again in a moment.'],
        ['USAGE_CONTEXT_EXCEEDED', 'This conversation is too long for the model. Start a new one.'],
        ['PROVIDER_ERROR', 'The assistant couldn’t answer. Try again in a moment.'],
        ['PROVIDER_UNAVAILABLE', 'The assistant couldn’t answer. Try again in a moment.'],
        // A retry would not help: nothing says "try again".
        ['USAGE_BAD_REQUEST', 'The assistant couldn’t answer this request.'],
        ['PROVIDER_POLICY', 'The assistant couldn’t answer this request.'],
        ['PROVIDER_MISCONFIGURED', 'The assistant couldn’t answer this request.'],
        ['CONFIG_INVALID_MODEL', 'The assistant couldn’t answer this request.'],
        ['UNKNOWN_ERROR', 'The assistant couldn’t answer this request.'],
    ])('%s reads "%s", never the message', (code, sentence) => {
        const el = draw(error(code));
        expect(said(el)).toBe(sentence);
        expect(el.textContent).not.toContain('overloaded');
        expect(el.getAttribute('data-error-code')).toBe(code);
    });

    it.each([
        ['MAX_TURNS_EXCEEDED', 'Stopped after 10 turns to avoid an endless loop.'],
        ['CONFIG_NO_PROVIDER', 'No provider selected. Please configure a provider.'],
        ['CONFIG_MISSING_KEY', "Provider 'x' is not registered."],
        ['APP_OUT_OF_STOCK', 'That bread is sold out today.'],
    ])('%s keeps its own words: they were written for the reader or the developer', (code, content) => {
        expect(said(draw(error(code, content)))).toBe(content);
    });

    it('an error with no code keeps its own words: an app or a plugin wrote them', () => {
        expect(said(draw(error(undefined, 'Your basket expired.')))).toBe('Your basket expired.');
    });

    it('follows the locale, and a language switch rewrites it', () => {
        aparteGlobalConfig.extendLocale({ errorUnreachable: 'L’assistant est injoignable.' });
        const el = draw(error('NET_ERROR'));
        expect(said(el)).toBe('L’assistant est injoignable.');
        aparteGlobalConfig.extendLocale({ errorUnreachable: 'Der Assistent ist nicht erreichbar.' });
        getSegmentRenderer('error')!.relabel!(el, error('NET_ERROR') as never);
        expect(said(el)).toBe('Der Assistent ist nicht erreichbar.');
    });

    it('a language switch leaves a custom renderer\'s card alone: it is the app\'s', () => {
        aparteGlobalConfig.setErrorRenderer(({ sentence }) => {
            const card = document.createElement('div');
            card.innerHTML = `<p class="aparte-alert__message">${sentence} — status.example.com</p>`;
            return card;
        });
        const host = document.createElement('div');
        const out = getSegmentRenderer('error')!.render(error('NET_ERROR') as never) as HTMLElement;
        host.append(out);
        aparteGlobalConfig.extendLocale({ errorUnreachable: 'Injoignable.' });
        getSegmentRenderer('error')!.relabel!(out, error('NET_ERROR') as never);
        expect(said(out)).toBe('The assistant can’t be reached right now. Try again in a moment. — status.example.com');
    });

    it('a language switch leaves an error that keeps its own words alone', () => {
        const el = draw(error('MAX_TURNS_EXCEEDED', 'Stopped after 10 turns to avoid an endless loop.'));
        aparteGlobalConfig.extendLocale({ errorFailed: 'Échec.' });
        getSegmentRenderer('error')!.relabel!(el, error('MAX_TURNS_EXCEEDED', 'Stopped after 10 turns to avoid an endless loop.') as never);
        expect(said(el)).toBe('Stopped after 10 turns to avoid an endless loop.');
    });

    it('a custom error renderer receives the message, the code and the sentence', () => {
        const seen = vi.fn(() => '<div class="mine"></div>');
        aparteGlobalConfig.setErrorRenderer(seen);
        getSegmentRenderer('error')!.render(error('NET_ERROR', 'Failed to fetch') as never);
        expect(seen).toHaveBeenCalledWith({
            message: 'Failed to fetch',
            sentence: 'The assistant can’t be reached right now. Try again in a moment.',
            code: 'NET_ERROR',
        });
    });

    it('gives no sentence to a custom renderer for an error that keeps its own words', () => {
        const seen = vi.fn(() => '<div class="mine"></div>');
        aparteGlobalConfig.setErrorRenderer(seen);
        getSegmentRenderer('error')!.render(error('MAX_TURNS_EXCEEDED', 'Stopped after 10 turns.') as never);
        expect(seen).toHaveBeenCalledWith({ message: 'Stopped after 10 turns.', code: 'MAX_TURNS_EXCEEDED' });
    });
});

describe('the message a sentence replaces', () => {
    it('goes to the console when the turn fails, and stays on the segment', async () => {
        document.body.innerHTML = '<aparte-chat-viewport id="chat"></aparte-chat-viewport>';
        const viewport = document.getElementById('chat') as HTMLElement & { getMessages(): AparteMessage[] };
        await vi.waitFor(() => expect(typeof viewport.getMessages).toBe('function'));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const config = new AparteConfig();
        config.registerAIProvider({
            id: 'mock',
            getMetadata: () => ({ id: 'mock', name: 'mock' }),
            getModels: () => [{ id: 'm', name: 'M', capabilities: ['streaming'] }],
            chat: async () => new ReadableStream<AparteStreamEvent>({
                start(c) {
                    c.enqueue({ type: 'error', message: 'vendor exploded: 500 {"detail":"oops"}', code: 'PROVIDER_ERROR' } as AparteStreamEvent);
                    c.close();
                },
            }),
        } as never);
        config.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        const client = new AparteClient({ config, autoRegister: false });
        client.start();

        viewport.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content: 'hello', timestamp: Date.now(), targetId: 'chat' }, bubbles: true, composed: true,
        }));
        await vi.waitFor(() => expect(viewport.getMessages().at(-1)?.status).toBe('error'));

        const segment = viewport.getMessages().at(-1)!.segments!.find((s) => s.type === 'error') as AparteErrorSegment;
        expect(segment.content).toBe('vendor exploded: 500 {"detail":"oops"}');
        expect(warn.mock.calls.map((c) => String(c[0])).some((m) => m.includes('vendor exploded: 500'))).toBe(true);
        expect(segment.code).toBe('PROVIDER_ERROR');
        client.stop();
    });
});

describe("a tool's crash is the tool's, not the network's or the provider's", () => {
    const tool = (name: string): AparteTool => ({ name, description: name, inputSchema: { type: 'object', properties: {} } });

    /** One tool call, a handler that throws `crash`, and the error segment the turn ends on. */
    async function crashWith(crash: unknown): Promise<AparteErrorSegment | undefined> {
        const cfg = new AparteConfig();
        cfg.registerAIProvider({
            id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
            getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
        } as never);
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setKeyProvider(() => 'k');
        cfg.registerTool(tool('get_weather'), (async () => { throw crash; }) as never);
        let served = false;
        cfg.setTransport({
            chat: () => new ReadableStream({
                start(controller) {
                    if (!served) { served = true; controller.enqueue({ type: 'tool_use', id: 'c1', name: 'get_weather', input: {} }); }
                    controller.enqueue({ type: 'done' });
                    controller.close();
                },
            }),
        } as never);
        const segments: AparteErrorSegment[] = [];
        const el = document.createElement('div');
        for (const m of ['addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage']) {
            (el as unknown as Record<string, unknown>)[m] = () => {};
        }
        (el as unknown as Record<string, unknown>)['updateMessage'] = (_id: string, patch: { segments?: Array<{ type: string }> }) => {
            for (const s of patch.segments ?? []) if (s.type === 'error') segments.push(s as AparteErrorSegment);
        };
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const client = new AparteClient({ config: cfg, autoRegister: false });
        await (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
            ._streamTurn(el, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');
        return segments.at(-1);
    }

    it("a tool's failed fetch does not read as the assistant being unreachable", async () => {
        const segment = await crashWith(new TypeError('Failed to fetch'));
        expect(segment?.code).toBe('UNKNOWN_ERROR');
        expect(segment?.content).toBe('Failed to fetch');
    });

    it("a tool's 401 does not blame the model provider's key", async () => {
        const segment = await crashWith(Object.assign(new Error('Unauthorized'), { status: 401 }));
        expect(segment?.code).toBe('UNKNOWN_ERROR');
    });
});
