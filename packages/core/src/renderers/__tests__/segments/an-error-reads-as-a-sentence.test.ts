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
        ['CONFIG_INVALID_KEY', 'The model provider refused the request. Check the API key and its access.'],
        ['USAGE_RATE_LIMIT', 'Too many requests right now. Try again in a moment.'],
        ['USAGE_CONTEXT_EXCEEDED', 'This conversation is too long for the model. Start a new one.'],
        ['USAGE_BAD_REQUEST', 'The assistant couldn’t answer. Try again in a moment.'],
        ['PROVIDER_ERROR', 'The assistant couldn’t answer. Try again in a moment.'],
        ['PROVIDER_UNAVAILABLE', 'The assistant couldn’t answer. Try again in a moment.'],
        ['PROVIDER_POLICY', 'The assistant couldn’t answer. Try again in a moment.'],
        ['UNKNOWN_ERROR', 'The assistant couldn’t answer. Try again in a moment.'],
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
        ['CONFIG_INVALID_MODEL', 'Model "y" does not exist.'],
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

    it('a language switch leaves an error that keeps its own words alone', () => {
        const el = draw(error('MAX_TURNS_EXCEEDED', 'Stopped after 10 turns to avoid an endless loop.'));
        aparteGlobalConfig.extendLocale({ errorFailed: 'Échec.' });
        getSegmentRenderer('error')!.relabel!(el, error('MAX_TURNS_EXCEEDED', 'Stopped after 10 turns to avoid an endless loop.') as never);
        expect(said(el)).toBe('Stopped after 10 turns to avoid an endless loop.');
    });

    it('a custom error renderer still receives the message and the code', () => {
        const seen = vi.fn(() => '<div class="mine"></div>');
        aparteGlobalConfig.setErrorRenderer(seen);
        getSegmentRenderer('error')!.render(error('NET_ERROR', 'Failed to fetch') as never);
        expect(seen).toHaveBeenCalledWith({ message: 'Failed to fetch', code: 'NET_ERROR' });
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
