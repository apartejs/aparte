// @vitest-environment jsdom
/**
 * The turn-limit message is the chat's text, so it speaks the chat's language.
 *
 * It was a hard-coded English sentence — "Stopped after 3 tool calls to prevent an
 * infinite loop." — in a chat set to French, the one string of the turn that bypassed
 * the locale. It reads `maxTurnsReached` now, with `{n}` the limit that was reached.
 */
import { describe, it, expect } from 'vitest';
import { createStreamAdapter } from '../stream-adapter.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteSegment, AparteErrorSegment } from '../../types/index.js';

function limitReached(config: AparteConfig): AparteErrorSegment | undefined {
    const added: AparteSegment[] = [];
    const emit = createStreamAdapter({
        target: { addSegment: (s: AparteSegment) => { added.push(s); }, updateSegment: () => {}, updateMessage: () => {}, dispatchEvent: () => true },
        config,
        messageId: 'm1',
    });
    emit({ type: 'run-start' });
    emit({ type: 'turn-limit-exceeded', scope: 'global', limit: 3 });
    return added.find((s) => s.type === 'error') as AparteErrorSegment | undefined;
}

describe('the turn-limit message', () => {
    it('reads the default locale, with the limit in it', () => {
        expect(limitReached(new AparteConfig())?.content).toBe('Stopped after 3 turns to avoid an endless loop.');
    });

    it('speaks the chat\'s language', () => {
        const config = new AparteConfig();
        config.extendLocale({ maxTurnsReached: 'Arrêté après {n} tours pour éviter une boucle sans fin.' });
        expect(limitReached(config)?.content).toBe('Arrêté après 3 tours pour éviter une boucle sans fin.');
    });
});

describe('the turn-limit message, for a chat with a config of its own', () => {
    it('speaks the CHAT\'s language when the client runs on another config', async () => {
        const { attachConfig } = await import('../../config/config-context.js');
        const { aparteGlobalConfig } = await import('../../config/index.js');
        const chat = new AparteConfig();
        chat.extendLocale({ maxTurnsReached: 'Arrêté après {n} tours.' });
        const host = document.createElement('div');
        const target = document.createElement('div');
        host.appendChild(target);
        document.body.appendChild(host);
        attachConfig(host, chat);
        const added: AparteSegment[] = [];
        Object.assign(target, { addSegment: (s: AparteSegment) => { added.push(s); }, updateSegment: () => {}, updateMessage: () => {} });
        // The client runs on the global config; the target belongs to the French chat.
        const emit = createStreamAdapter({ target: target as never, config: aparteGlobalConfig, messageId: 'm1' });
        emit({ type: 'turn-limit-exceeded', scope: 'global', limit: 3 });
        expect((added.find((s) => s.type === 'error') as AparteErrorSegment | undefined)?.content).toBe('Arrêté après 3 tours.');
        host.remove();
    });
});
