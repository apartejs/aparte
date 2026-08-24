// @vitest-environment jsdom
/**
 * The one hook an element uses to hear that its config changed.
 *
 * Five components had five verbatim copies of this scope rule and the event name
 * written out as a literal in each; sixteen other files that read config at render
 * time had none. The interesting property is not that it fires — it is WHEN it
 * refuses to, and that it resolves the element's config per event rather than
 * capturing it. `AparteChatStatus` documents why: caching the config at connect
 * made the element "permanently deaf to its own instance", because the filter meant
 * to isolate two chats on one page compared against a value latched before the
 * instance existed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { subscribeConfigChange, APARTE_CONFIG_CHANGE } from '../config-subscribe.js';
import { AparteConfig, aparteGlobalConfig } from '../aparte-config.js';
import { attachConfig, detachConfig } from '../config-context.js';

function el(): HTMLElement {
    const node = document.createElement('div');
    document.body.appendChild(node);
    return node;
}

const fire = (config?: unknown) =>
    window.dispatchEvent(new CustomEvent(APARTE_CONFIG_CHANGE, { detail: config ? { config } : {} }));

describe('subscribeConfigChange', () => {
    afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

    it('fires on a bare notify, which is what a manual _notify() produces', () => {
        const handler = vi.fn();
        subscribeConfigChange(el(), handler);
        fire();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires when the change belongs to the element’s own config', () => {
        const handler = vi.fn();
        subscribeConfigChange(el(), handler);
        fire(aparteGlobalConfig);
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('stays silent for another chat’s config', () => {
        const handler = vi.fn();
        subscribeConfigChange(el(), handler);
        fire(new AparteConfig());
        expect(handler).not.toHaveBeenCalled();
    });

    it('resolves the config PER EVENT, so an element is never deaf to its own instance', () => {
        // Subscribe first, while the element resolves to the global…
        const host = el();
        const child = document.createElement('span');
        host.appendChild(child);
        const handler = vi.fn();
        subscribeConfigChange(child, handler);

        // …then the instance boundary appears above it, as a wrapper mounting a chat
        // does. A helper that captured `resolveConfig(el)` at subscribe time would
        // have latched the global here and ignored every instance change after it.
        const instance = new AparteConfig();
        attachConfig(host, instance);
        handler.mockClear();

        fire(instance);
        expect(handler, 'the element did not hear its own instance').toHaveBeenCalledTimes(1);

        // And it is still deaf to a third config.
        handler.mockClear();
        fire(new AparteConfig());
        expect(handler).not.toHaveBeenCalled();

        detachConfig(host);
    });

    it('unsubscribes', () => {
        const handler = vi.fn();
        const off = subscribeConfigChange(el(), handler);
        off();
        fire();
        expect(handler).not.toHaveBeenCalled();
    });

    it('is what the real setters dispatch — not a synthetic event this test invented', () => {
        const handler = vi.fn();
        subscribeConfigChange(el(), handler);
        // The three setters this whole lot exists for.
        aparteGlobalConfig.setIconProvider({ send: () => '<svg/>' });
        aparteGlobalConfig.setBubbleActions({ retry: true });
        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), sendButton: 'Envoyer' });
        expect(handler).toHaveBeenCalledTimes(3);
    });
});
