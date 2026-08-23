/**
 * `requireModelSelection` has to hold for every send, not just the composer's.
 *
 * The gate was drawn by `aparte-composer` (greying itself, refusing `submit()`)
 * and enforced nowhere else. Everything else that can produce an `aparte-send`
 * walked past it: an app's suggestion chip, a "try this prompt" button, a host
 * dispatching the event itself. The turn then ran with `config.defaultModel || ''`
 * — an empty model id, i.e. a real request to the provider that cannot succeed.
 *
 * Found in an example: the chips above the composer are clickable while the
 * composer is still greyed out, waiting for `GET /models` to come back.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';

function harness(): { cfg: AparteConfig; el: HTMLElement; requests: () => number } {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }],
    } as never);
    cfg.setKeyProvider(() => 'k');

    let calls = 0;
    cfg.setTransport({
        chat: () => {
            calls += 1;
            return new ReadableStream({
                start(controller) {
                    controller.enqueue({ type: 'done' });
                    controller.close();
                },
            });
        },
    } as never);

    const el = document.createElement('div');
    el.id = 'chat-under-test';
    for (const m of ['appendMessage', 'updateMessage', 'addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage']) {
        (el as unknown as Record<string, unknown>)[m] = () => {};
    }
    document.body.appendChild(el);
    return { cfg, el, requests: () => calls };
}

/** What a suggestion chip does: dispatch the event the composer would have. */
function chipClick(el: HTMLElement, content: string): void {
    el.dispatchEvent(new CustomEvent('aparte-send', {
        detail: { content, timestamp: 1, targetId: el.id },
        bubbles: true,
        composed: true,
    }));
}

describe('the model gate holds for a send the composer did not make', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
        document.body.innerHTML = '';
    });

    it('refuses, and says why, while no model is selected', async () => {
        const { cfg, el, requests } = harness();
        cfg.setRequireModelSelection(true);
        const client = new AparteClient({ config: cfg, autoRegister: false });
        client.start();

        chipClick(el, 'a prompt from a chip');
        await new Promise((r) => setTimeout(r, 0));

        expect(requests(), 'nothing may reach the provider without a model').toBe(0);
        expect(warn, 'the developer is the one who can fix this').toHaveBeenCalled();
        client.stop();
    });

    it('lets the same send through once a model is selected', async () => {
        const { cfg, el, requests } = harness();
        cfg.setRequireModelSelection(true);
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        const client = new AparteClient({ config: cfg, autoRegister: false });
        client.start();

        chipClick(el, 'a prompt from a chip');
        await vi.waitFor(() => expect(requests()).toBe(1));
        client.stop();
    });

    it('does not gate an app that never asked for the gate', async () => {
        const { cfg, el, requests } = harness();
        // requireModelSelection stays off — the default. A single-model app that
        // sets `defaultModel` itself must be untouched by any of this.
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        const client = new AparteClient({ config: cfg, autoRegister: false });
        client.start();

        chipClick(el, 'a prompt from a chip');
        await vi.waitFor(() => expect(requests()).toBe(1));
        client.stop();
    });
});
