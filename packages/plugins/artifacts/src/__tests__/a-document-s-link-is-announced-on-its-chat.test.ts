/**
 * A document's link is a link of the conversation.
 *
 * `<aparte-artifact-panel>` sits beside the chat, outside every message, so no message hears a
 * click in it, and an app that routes the links a reply holds (`aparte-link-click`) could not
 * route a link of the document the model wrote: a same-site one replaced the page. The panel
 * announces it on its chat, cancelable, as a message announces its own. The links the app put
 * in the header are the app's.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import type { AparteLinkClickEventDetail, AparteMessage, AparteSegment, AparteToolCallSegment } from '@aparte/core';
import { setupArtifacts } from '../index.js';
import '../panel.js';

let teardown: (() => void) | null = null;
let n = 0;

/** A stand-in for marked: `[text](href)` as a bare anchor. */
const links = (md: string): string => md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

const call = (structured: Record<string, unknown>): AparteToolCallSegment => ({
    id: `seg-${++n}`, type: 'tool_call', status: 'resolved', result: 'ok',
    toolCall: { id: `call-${n}`, name: 'create_artifact', input: {} }, structuredResult: structured,
});
const reply = (id: string, ...segments: AparteSegment[]): AparteMessage => ({ id, role: 'assistant', content: '', timestamp: 0, segments }) as AparteMessage;
const doc = (content: string) => call({ documentId: 'doc_1', mimeType: 'text/markdown', title: 'Plan', content });

/** A chat as the panel sees one: an element with an id, `getMessages()` and events. */
function chat(messages: AparteMessage[]): HTMLElement {
    const element = Object.assign(document.createElement('div'), { getMessages: () => messages });
    element.id = 'chat';
    document.body.append(element);
    return element;
}
function panelFor(): HTMLElement {
    const panel = document.createElement('aparte-artifact-panel');
    panel.setAttribute('for', 'chat');
    document.body.append(panel);
    return panel;
}
const click = (anchor: Element): MouseEvent => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    return event;
};

describe('a link in the document a panel shows', () => {
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

    it('opens in a new tab, and is announced on the chat, cancelable', () => {
        const host = chat([reply('a1', doc('See [the notes](notes.md).'))]);
        const panel = panelFor();
        const link = panel.querySelector<HTMLAnchorElement>('a[href="notes.md"]')!;
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        const seen: AparteLinkClickEventDetail[] = [];
        host.addEventListener('aparte-link-click', (event) => {
            seen.push((event as CustomEvent<AparteLinkClickEventDetail>).detail);
            event.preventDefault();
        });

        const event = click(link);
        expect(seen).toEqual([{ href: 'notes.md', anchor: link, messageId: 'a1' }]);
        expect(event.defaultPrevented, 'the cancelled announcement cancels the click').toBe(true);
    });

    it('is followed when nobody cancels it', () => {
        const host = chat([reply('a1', doc('See [the notes](notes.md).'))]);
        const panel = panelFor();
        let heard = 0;
        host.addEventListener('aparte-link-click', () => { heard++; });
        let prevented: boolean | undefined;
        document.addEventListener('click', (event) => { prevented = event.defaultPrevented; event.preventDefault(); }, { once: true });
        click(panel.querySelector('a[href="notes.md"]')!);
        expect(heard).toBe(1);
        expect(prevented).toBe(false);
    });

    it("leaves the app's own links in the header to the app", () => {
        const host = chat([reply('a1', doc('See [the notes](notes.md).'))]);
        const panel = document.createElement('aparte-artifact-panel');
        panel.setAttribute('for', 'chat');
        const own = Object.assign(document.createElement('a'), { href: '#export', textContent: 'Export', slot: 'actions' });
        panel.append(own);
        document.body.append(panel);
        let heard = 0;
        host.addEventListener('aparte-link-click', () => { heard++; });
        document.addEventListener('aparte-link-click', () => { heard++; });
        click(own);
        expect(heard).toBe(0);
    });
});
