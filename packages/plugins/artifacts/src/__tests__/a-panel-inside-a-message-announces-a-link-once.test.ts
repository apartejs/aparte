/**
 * A panel placed inside a message announces a link click once.
 *
 * An app's own renderer can put `<aparte-artifact-panel>` inside a bubble. The bubble announces
 * every click on a link in its body, so the panel must stay quiet there: a handler that cancels
 * the first announcement would otherwise hear a second. Beside the chat the panel announces.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import type { AparteMessage, AparteSegment, AparteToolCallSegment } from '@aparte/core';
import { setupArtifacts } from '../index.js';
import '../panel.js';

let teardown: (() => void) | null = null;

const links = (md: string): string => md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

const call: AparteToolCallSegment = {
    id: 'seg-1', type: 'tool_call', status: 'resolved', result: 'ok',
    toolCall: { id: 'call-1', name: 'create_artifact', input: {} },
    structuredResult: { documentId: 'doc_1', mimeType: 'text/markdown', title: 'Plan', content: 'See [the notes](notes.md).' },
};
const reply = (...segments: AparteSegment[]): AparteMessage => ({ id: 'a1', role: 'assistant', content: '', timestamp: 0, segments }) as AparteMessage;

function chat(): HTMLElement {
    const element = Object.assign(document.createElement('div'), { getMessages: () => [reply(call)] });
    element.id = 'chat';
    document.body.append(element);
    return element;
}

function panelIn(parent: Element): HTMLElement {
    const panel = document.createElement('aparte-artifact-panel');
    panel.setAttribute('for', 'chat');
    parent.append(panel);
    return panel;
}

function clicks(panel: HTMLElement): number {
    let heard = 0;
    const listener = (event: Event): void => { heard++; event.preventDefault(); };
    document.addEventListener('aparte-link-click', listener);
    panel.querySelector('a[href="notes.md"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    document.removeEventListener('aparte-link-click', listener);
    return heard;
}

describe('an artifact panel and a link click', () => {
    beforeEach(() => {
        teardown = setupArtifacts();
        aparteGlobalConfig.setMarkdownProvider(links);
    });
    afterEach(() => {
        teardown?.();
        teardown = null;
        aparteGlobalConfig.reset();
        document.body.innerHTML = '';
        document.head.querySelector('#aparte-artifact-panel-styles')?.remove();
    });

    it('inside a message: announced once, by the bubble', () => {
        chat();
        const bubble = document.createElement('aparte-chat-bubble');
        bubble.setAttribute('message-id', 'a1');
        document.body.append(bubble);
        expect(clicks(panelIn(bubble))).toBe(1);
    });

    it('beside the chat: announced once, by the panel', () => {
        chat();
        expect(clicks(panelIn(document.body))).toBe(1);
    });
});
