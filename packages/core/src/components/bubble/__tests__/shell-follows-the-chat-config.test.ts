// @vitest-environment jsdom
/**
 * A chat's own bubble frame reaches the messages drawn before its config was attached.
 *
 * Under every wrapper the chat's config is attached after the first messages are drawn
 * (`AparteChatHost.bind()` runs post-mount). The frame was drawn once, at connect, so those
 * messages kept the global frame while every later one wore the chat's.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig, AparteConfig } from '../../../config/index.js';
import { attachConfig } from '../../../config/config-context.js';

interface BubbleEl extends HTMLElement { setContent(content: string): void }

const SHELL = `<div class="aparte-message my-frame"><div class="aparte-message-content"><div class="aparte-segments"></div><div class="aparte-content"></div></div><div class="aparte-action-bar"></div></div>`;

afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

describe('a per-chat bubble frame', () => {
    it('is applied to a bubble drawn before the chat config was attached, content kept', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const bubble = document.createElement('aparte-chat-bubble') as BubbleEl;
        bubble.setAttribute('data-role', 'assistant');
        bubble.setAttribute('message-id', 'm1');
        host.appendChild(bubble);
        bubble.setContent('Hello there');
        expect(bubble.querySelector('.my-frame')).toBeNull();

        const own = new AparteConfig();
        own.setBubbleShellRenderer(() => SHELL);
        attachConfig(host, own);

        expect(bubble.querySelector('.my-frame'), 'the chat frame').not.toBeNull();
        expect(bubble.querySelector('.aparte-content')!.textContent).toContain('Hello there');
        expect(bubble.querySelectorAll('.aparte-message')).toHaveLength(1);
    });

    it('leaves a bubble alone when the new config brings the same frame', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const bubble = document.createElement('aparte-chat-bubble') as BubbleEl;
        bubble.setAttribute('message-id', 'm1');
        host.appendChild(bubble);
        bubble.setContent('Hi');
        const drawn = bubble.querySelector('.aparte-message');
        attachConfig(host, new AparteConfig());   // no frame either side
        expect(bubble.querySelector('.aparte-message')).toBe(drawn);
    });
});
