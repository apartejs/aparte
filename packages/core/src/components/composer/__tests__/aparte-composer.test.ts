// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-composer.js';
import type { AparteComposer } from '../aparte-composer.js';
import type { AparteComposerChangeEventDetail } from '../aparte-composer.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';

/**
 * Public state observability — the `aparte-composer-change` DOM event + getState()
 * are what let a custom send button (or footer control) OUTSIDE the composer
 * package mirror live state without the private `_on`/`_emit` bus.
 */
describe('aparte-composer — public state events', () => {
    let composer: AparteComposer;

    beforeEach(() => {
        composer = document.createElement('aparte-composer') as AparteComposer;
        document.body.appendChild(composer);
    });

    afterEach(() => {
        composer.remove();
        vi.restoreAllMocks();
    });

    function onChange() {
        const spy = vi.fn();
        composer.addEventListener('aparte-composer-change', (e) => {
            spy((e as CustomEvent<AparteComposerChangeEventDetail>).detail);
        });
        return spy;
    }

    it('getState() reflects value, attachments and panel state', () => {
        expect(composer.getState()).toMatchObject({
            value: '', streaming: false, disabled: false, attachments: [], panelActive: false,
        });
        composer.setValue('hi');
        composer.addAttachments([new File(['x'], 'a.txt')]);
        const s = composer.getState();
        expect(s.value).toBe('hi');
        expect(s.attachments).toHaveLength(1);
        // Snapshot is a copy — mutating it must not touch internal state.
        s.attachments.push(new File(['y'], 'b.txt'));
        expect(composer.getState().attachments).toHaveLength(1);
    });

    it('fires aparte-composer-change with the full state snapshot on setValue', () => {
        const spy = onChange();
        composer.setValue('hello');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0].state).toMatchObject({ value: 'hello' });
        expect(spy.mock.calls[0][0].composer).toBe(composer);
    });

    it('mirrors streaming lifecycle (window events) to the public event', () => {
        const spy = onChange();
        window.dispatchEvent(new CustomEvent('aparte-message-start'));
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0].state.streaming).toBe(true);
        window.dispatchEvent(new CustomEvent('aparte-message-done'));
        expect(spy.mock.calls[1][0].state.streaming).toBe(false);
    });

    it('fires on attachment and disabled changes', () => {
        const spy = onChange();
        composer.addAttachments([new File(['x'], 'a.txt')]);
        composer.setAttribute('disabled', '');
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy.mock.calls[0][0].state.attachments).toHaveLength(1);
        expect(spy.mock.calls[1][0].state.disabled).toBe(true);
    });

    it('does NOT fire composer-change on submit — that is an action (aparte-send)', () => {
        composer.setValue('ready');
        const changeSpy = onChange();
        const sendSpy = vi.fn();
        composer.addEventListener('aparte-send', sendSpy);
        composer.submit();
        expect(sendSpy).toHaveBeenCalledTimes(1);
        // submit() clears the field afterwards → those clears DO emit change,
        // but the submit event itself must not. Assert the send fired and the
        // change events we see are only the post-submit clears (value + attachments).
        for (const call of changeSpy.mock.calls) {
            expect(call[0].state.value).toBe(''); // never the pre-submit 'ready'
        }
    });

    it('emits a public aparte-cancel on cancel(), symmetric with aparte-send', () => {
        const cancelSpy = vi.fn();
        composer.addEventListener('aparte-cancel', cancelSpy);
        composer.cancel();
        expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    it('the change event bubbles and crosses shadow boundaries (composed)', () => {
        const outer = vi.fn();
        document.body.addEventListener('aparte-composer-change', outer);
        composer.setValue('x');
        expect(outer).toHaveBeenCalledTimes(1);
        document.body.removeEventListener('aparte-composer-change', outer);
    });
});

describe('aparte-composer — model-selection gate (opt-in)', () => {
    let composer: AparteComposer;

    afterEach(() => {
        composer?.remove();
        aparteGlobalConfig.reset(); // clears requireModelSelection + modelConfig
        vi.restoreAllMocks();
    });

    function mount(): AparteComposer {
        const c = document.createElement('aparte-composer') as AparteComposer;
        document.body.appendChild(c); // connectedCallback evaluates the gate
        return c;
    }

    it('blocks send + sets data-model-gated when a model is required but none selected', () => {
        aparteGlobalConfig.setRequireModelSelection(true);
        composer = mount();
        expect(composer.hasAttribute('data-model-gated')).toBe(true);

        composer.setValue('hi');
        const sendSpy = vi.fn();
        composer.addEventListener('aparte-send', sendSpy);
        composer.submit();
        expect(sendSpy).not.toHaveBeenCalled();
    });

    it('ungates + sends once a model is selected (reacts to config change)', () => {
        aparteGlobalConfig.setRequireModelSelection(true);
        composer = mount();
        expect(composer.hasAttribute('data-model-gated')).toBe(true);

        aparteGlobalConfig.setModelConfig({ defaultProvider: 'p', defaultModel: 'm' });
        expect(composer.hasAttribute('data-model-gated')).toBe(false);

        composer.setValue('hi');
        const sendSpy = vi.fn();
        composer.addEventListener('aparte-send', sendSpy);
        composer.submit();
        expect(sendSpy).toHaveBeenCalledTimes(1);
    });

    it('does not gate when requireModelSelection is off (default) — unaffected setups', () => {
        composer = mount();
        expect(composer.hasAttribute('data-model-gated')).toBe(false);
        composer.setValue('hi');
        const sendSpy = vi.fn();
        composer.addEventListener('aparte-send', sendSpy);
        composer.submit();
        expect(sendSpy).toHaveBeenCalledTimes(1);
    });
});

/**
 * Multi-instance streaming isolation — lifecycle events carry the target host's
 * id, and a composer only reacts to its own. Before this, streaming in one chat
 * flipped every composer on the page to the "Stop" state (and cancel reset them
 * all). Single-instance pages have no target id, so events still broadcast.
 */
describe('aparte-composer — multi-instance streaming isolation', () => {
    let a: AparteComposer;
    let b: AparteComposer;

    beforeEach(() => {
        a = document.createElement('aparte-composer') as AparteComposer;
        a.setAttribute('target', 'chat-a');
        b = document.createElement('aparte-composer') as AparteComposer;
        b.setAttribute('target', 'chat-b');
        document.body.append(a, b);
    });
    afterEach(() => {
        a.remove();
        b.remove();
    });

    it('only the targeted composer enters the streaming state', () => {
        window.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { targetId: 'chat-a' } }));
        expect(a.streaming).toBe(true);
        expect(b.streaming).toBe(false); // was: the cross-talk flipped B too
    });

    it('only the targeted composer leaves the streaming state', () => {
        window.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { targetId: 'chat-a' } }));
        window.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { targetId: 'chat-b' } }));
        expect(a.streaming).toBe(true);
        expect(b.streaming).toBe(true);

        window.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { targetId: 'chat-a' } }));
        expect(a.streaming).toBe(false);
        expect(b.streaming).toBe(true); // B's turn is untouched by A finishing
    });

    it('an untargeted (broadcast) lifecycle event still reaches every composer', () => {
        window.dispatchEvent(new CustomEvent('aparte-message-start'));
        expect(a.streaming).toBe(true);
        expect(b.streaming).toBe(true);
    });
});

/**
 * Raw core: nobody sets `target` on the composer.
 *
 * All four wrappers set it themselves, so the attribute alone identified a composer
 * there — and in hand-written markup, which is the documented quick start, it was
 * simply absent. `!this.targetId` was then true and the composer accepted EVERY
 * chat's lifecycle events, so on a two-chat page one chat's Stop tore down the
 * other's open elicitation panel while its tool call kept waiting: the question
 * vanished and the turn hung.
 *
 * Surfaced by a two-chat test written for the elicitation presenter. Raw core with
 * two chats is a shape nothing in this repo exercised.
 */
describe('aparte-composer — a composer with no target attribute finds its chat', () => {
    /** The shape the plain-root wrappers render, minus the `target` they would set. */
    function chatWith(id: string): AparteComposer {
        const host = document.createElement('div');
        host.setAttribute('data-aparte-chat', '');
        host.id = id;
        const composer = document.createElement('aparte-composer') as AparteComposer;
        host.appendChild(composer);
        document.body.appendChild(host);
        return composer;
    }

    afterEach(() => { document.body.innerHTML = ''; });

    it('ignores another chat\'s turn', () => {
        const a = chatWith('chat-a');
        const b = chatWith('chat-b');

        window.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { targetId: 'chat-b' } }));

        expect(a.streaming, 'A must not follow B\'s turn').toBe(false);
        expect(b.streaming).toBe(true);
    });

    it('and still follows its own', () => {
        const a = chatWith('chat-a');
        window.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { targetId: 'chat-a' } }));
        expect(a.streaming).toBe(true);
    });

    it('a composer outside any chat host stays a broadcast listener', () => {
        // Nothing identifies it, so it must keep accepting everything rather than
        // going deaf — the single-chat page that never sets a target id at all.
        const lone = document.createElement('aparte-composer') as AparteComposer;
        document.body.appendChild(lone);
        window.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { targetId: 'whatever' } }));
        expect(lone.streaming).toBe(true);
    });
});
