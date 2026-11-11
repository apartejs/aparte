/**
 * `<aparte-artifact-panel>`: a conversation's document, where the app puts it.
 *
 * It reads the conversation, shows one document and one version of it with the card's own
 * body, and follows the conversation. It owns no layout: Close only says so.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import type { AparteMessage, AparteSegment, AparteToolCallSegment } from '@aparte/core';
import { setupArtifacts, artifactSegment } from '../index.js';
import type { ArtifactDocument } from '../index.js';
import { AparteArtifactPanel } from '../panel.js';

let teardown: (() => void) | null = null;
let n = 0;

const call = (structured: Record<string, unknown>): AparteToolCallSegment => ({
    id: `seg-${++n}`, type: 'tool_call', status: 'resolved', result: 'ok',
    toolCall: { id: `call-${n}`, name: 'create_artifact', input: {} }, structuredResult: structured,
});
const reply = (id: string, ...segments: AparteSegment[]): AparteMessage => ({ id, role: 'assistant', content: '', timestamp: 0, segments }) as AparteMessage;
const doc = (documentId: string, content: string, title = 'Plan') => call({ documentId, mimeType: 'text/markdown', title, content });

/** A chat as the panel sees one: an element with an id, `getMessages()` and events. */
function chat(messages: AparteMessage[]): HTMLElement & { messages: AparteMessage[] } {
    const element = Object.assign(document.createElement('div'), { messages }) as HTMLElement & { messages: AparteMessage[]; getMessages: () => AparteMessage[] };
    element.id = 'chat';
    element.getMessages = () => element.messages;
    document.body.append(element);
    return element;
}
function panelFor(id = 'chat'): AparteArtifactPanel {
    const panel = document.createElement('aparte-artifact-panel');
    panel.setAttribute('for', id);
    document.body.append(panel);
    return panel;
}
const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const part = (panel: HTMLElement, name: string) => panel.querySelector<HTMLElement>(`.aparte-art-panel__${name}`)!;
const arrows = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLButtonElement>('.aparte-art-panel__version')];
const source = (panel: HTMLElement) => panel.querySelector('[data-pane="code"] code')?.textContent;

describe('<aparte-artifact-panel>', () => {
    beforeEach(() => { teardown = setupArtifacts(); });
    afterEach(() => { teardown?.(); teardown = null; aparteGlobalConfig.reset(); document.body.innerHTML = ''; document.head.querySelector('#aparte-artifact-panel-styles')?.remove(); });

    it('draws nothing while there is no document, and says so on itself', () => {
        chat([]);
        const panel = panelFor();
        expect(panel.hasAttribute('data-empty')).toBe(true);
        expect(part(panel, 'body').children).toHaveLength(0);
        expect(panel.shownDocument).toBeNull();
    });

    it('shows the document of the conversation with the card as its body', () => {
        chat([reply('a1', doc('doc_1', '# One'))]);
        const panel = panelFor();
        expect(panel.hasAttribute('data-empty')).toBe(false);
        expect(part(panel, 'title').textContent).toBe('Plan');
        expect(panel.getAttribute('role')).toBe('region');
        expect(panel.getAttribute('aria-labelledby')).toBe(part(panel, 'title').id);
        // The card, drawn for a panel: a Markdown document opens rendered, and has no Open button.
        const card = part(panel, 'body').querySelector('.aparte-segment-artifact-card')!;
        expect(card.getAttribute('data-tab')).toBe('preview');
        expect(card.querySelector('[data-action="open"]')).toBeNull();
        expect(source(panel)).toBe('# One');
        // One version: no arrows to count.
        expect(part(panel, 'versions').hidden).toBe(true);
    });

    it('shows the latest version, and the arrows walk the others', () => {
        chat([reply('a1', doc('doc_1', 'one')), reply('a2', doc('doc_1', 'two'))]);
        const panel = panelFor();
        const changes: unknown[] = [];
        panel.addEventListener('aparte-artifact-version-change', (event) => changes.push(event.detail));
        const [previous, next] = arrows(panel) as [HTMLButtonElement, HTMLButtonElement];

        expect(part(panel, 'versions').hidden).toBe(false);
        expect(part(panel, 'count').textContent).toBe('2 / 2');
        expect(part(panel, 'versions').getAttribute('aria-label')).toBe('Version 2 of 2');
        expect(source(panel)).toBe('two');
        expect(next.disabled).toBe(true);

        previous.click();
        expect(part(panel, 'count').textContent).toBe('1 / 2');
        expect(source(panel)).toBe('one');
        expect(panel.getAttribute('version')).toBe('1');
        expect(previous.disabled).toBe(true);
        expect(changes).toEqual([{ documentId: 'doc_1', version: 1, total: 2 }]);

        next.click();
        expect(source(panel)).toBe('two');
        // Back on the latest: no pinned version, so the next one that arrives is followed.
        expect(panel.hasAttribute('version')).toBe(false);
    });

    it('names its buttons in the chat\'s language', () => {
        chat([reply('a1', doc('doc_1', 'one')), reply('a2', doc('doc_1', 'two'))]);
        const panel = panelFor();
        const [previous, next] = arrows(panel);
        expect(previous!.getAttribute('aria-label')).toBe('Previous version');
        expect(next!.getAttribute('aria-label')).toBe('Next version');
        expect(part(panel, 'close').getAttribute('aria-label')).toBe('Close');
    });

    it('follows the conversation: a new version arrives and is shown', async () => {
        const source_ = chat([reply('a1', doc('doc_1', 'one'))]);
        const panel = panelFor();
        const changes: Array<{ version: number }> = [];
        panel.addEventListener('aparte-artifact-version-change', (event) => changes.push(event.detail));

        source_.messages = [...source_.messages, reply('a2', doc('doc_1', 'two'))];
        source_.dispatchEvent(new CustomEvent('aparte-message-done', { bubbles: true }));
        await frame();

        expect(part(panel, 'count').textContent).toBe('2 / 2');
        expect(source(panel)).toBe('two');
        expect(changes.map((c) => c.version)).toEqual([2]);
    });

    it('stays on the version somebody went back to when a new one arrives', async () => {
        const source_ = chat([reply('a1', doc('doc_1', 'one')), reply('a2', doc('doc_1', 'two'))]);
        const panel = panelFor();
        arrows(panel)[0]!.click();

        source_.messages = [...source_.messages, reply('a3', doc('doc_1', 'three'))];
        source_.dispatchEvent(new CustomEvent('aparte-artifact-change', { bubbles: true }));
        await frame();

        expect(part(panel, 'count').textContent).toBe('1 / 3');
        expect(source(panel)).toBe('one');
    });

    it('reads the conversation once a frame however many chunks arrive', async () => {
        const source_ = chat([reply('a1', doc('doc_1', 'one'))]);
        const panel = panelFor();
        const reads = vi.spyOn(source_ as unknown as { getMessages: () => AparteMessage[] }, 'getMessages');
        for (let i = 0; i < 20; i++) source_.dispatchEvent(new CustomEvent('aparte-segment-update', { bubbles: true }));
        await frame();
        expect(reads.mock.calls.length).toBeLessThanOrEqual(2);
        expect(panel.shownVersion?.content).toBe('one');
    });

    it('a document still being written keeps its card: the same element takes the new text', async () => {
        const writing = { ...artifactSegment('seg-tag', { documentId: 'doc_t', mimeType: 'text/markdown', title: 'Draft', content: 'par' }), isStreaming: true };
        const source_ = chat([reply('a1', writing)]);
        const panel = panelFor();
        const card = part(panel, 'body').firstElementChild;

        source_.messages = [reply('a1', { ...writing, content: 'partly written' })];
        source_.dispatchEvent(new CustomEvent('aparte-segment-update', { bubbles: true }));
        await frame();

        expect(part(panel, 'body').firstElementChild).toBe(card);
        expect(panel.shownVersion?.content).toBe('partly written');
    });

    it('shows the document the conversation touched last when none is named', () => {
        chat([reply('a1', doc('doc_a', 'a1', 'A')), reply('a2', doc('doc_b', 'b1', 'B')), reply('a3', doc('doc_a', 'a2', 'A'))]);
        const panel = panelFor();
        expect(panel.shownDocument?.id).toBe('doc_a');
        expect(panel.readDocuments().map((d) => d.id)).toEqual(['doc_b', 'doc_a']);
    });

    it('show(): a document, a version by number, or the version a card draws', () => {
        const first = doc('doc_a', 'a1', 'A');
        chat([reply('a1', first), reply('a2', doc('doc_b', 'b1', 'B')), reply('a3', doc('doc_a', 'a2', 'A'))]);
        const panel = panelFor();

        panel.show('doc_b');
        expect(part(panel, 'title').textContent).toBe('B');

        panel.show('doc_a', { segmentId: first.id });
        expect(source(panel)).toBe('a1');
        expect(panel.getAttribute('version')).toBe('1');

        panel.show('doc_a', { version: 2 });
        expect(source(panel)).toBe('a2');
        // The latest: not pinned.
        expect(panel.hasAttribute('version')).toBe(false);
    });

    it("shows the app's own documents when it gives them, with no conversation at all", () => {
        const panel = document.createElement('aparte-artifact-panel');
        document.body.append(panel);
        const version = { documentId: 'mine', index: 1, author: 'user' as const, messageId: 'm', mimeType: 'text/plain', artifactType: 'text', content: 'from my database' };
        const mine: ArtifactDocument = { id: 'mine', title: 'Mine', versions: [version], latest: version };
        panel.documents = [mine];
        expect(part(panel, 'title').textContent).toBe('Mine');
        expect(source(panel)).toBe('from my database');
        panel.documents = null;
        expect(panel.hasAttribute('data-empty')).toBe(true);
    });

    it('`read` reaches the reading of the conversation', () => {
        const foreign: AparteToolCallSegment = { id: 'f1', type: 'tool_call', status: 'resolved', result: 'saved', toolCall: { id: 'c', name: 'write_report', input: { body: '# Q3' } } };
        chat([reply('a1', foreign)]);
        const panel = panelFor();
        expect(panel.hasAttribute('data-empty')).toBe(true);
        panel.read = (segment) => (segment.type === 'tool_call' && segment.toolCall.name === 'write_report'
            ? { documentId: 'report', mimeType: 'text/markdown', title: 'Q3', content: (segment.toolCall.input as { body: string }).body }
            : null);
        expect(part(panel, 'title').textContent).toBe('Q3');
    });

    it('`render` draws a version itself, or hands one back to the built-in rendering', () => {
        chat([reply('a1', doc('doc_1', 'one')), reply('a2', call({ documentId: 'doc_2', mimeType: 'text/csv', title: 'Table', content: 'a,b' }))]);
        const panel = panelFor();
        const cleanup = vi.fn();
        panel.render = (version, container) => {
            if (version.artifactType !== 'csv') return false;
            container.textContent = `my table: ${version.content}`;
            return cleanup;
        };
        // The CSV is the app's.
        expect(part(panel, 'body').textContent).toBe('my table: a,b');
        expect(part(panel, 'body').querySelector('.aparte-segment-artifact-card')).toBeNull();

        // The Markdown document is handed back: the card draws it, and the app's view is cleaned up.
        panel.show('doc_1');
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(part(panel, 'body').querySelector('.aparte-segment-artifact-card')).not.toBeNull();
    });

    it('Close and Escape say so, and the panel hides nothing itself', () => {
        chat([reply('a1', doc('doc_1', 'one'))]);
        const panel = panelFor();
        const closed = vi.fn();
        document.body.addEventListener('aparte-artifact-panel-close', closed);

        part(panel, 'close').click();
        part(panel, 'title').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(closed).toHaveBeenCalledTimes(2);
        expect(panel.hasAttribute('data-empty')).toBe(false);
        expect(panel.isConnected).toBe(true);
        document.body.removeEventListener('aparte-artifact-panel-close', closed);
    });

    it("leaves the app's own buttons where the app wrote them", () => {
        chat([reply('a1', doc('doc_1', 'one'))]);
        const panel = document.createElement('aparte-artifact-panel');
        panel.setAttribute('for', 'chat');
        const mine = document.createElement('div');
        mine.slot = 'actions';
        mine.innerHTML = '<button type="button">Export</button>';
        panel.append(mine);
        document.body.append(panel);

        // Still a direct child, between the panel's own parts: nothing was moved or wrapped.
        expect(mine.parentElement).toBe(panel);
        expect([...panel.children].map((c) => c.className || c.getAttribute('slot'))).toEqual([
            'aparte-art-panel__title', 'aparte-art-panel__versions', 'actions',
            'aparte-btn aparte-btn--icon aparte-btn--sm aparte-art-panel__close', 'aparte-art-panel__body',
        ]);
    });

    it('builds its parts once, however often it is moved in the page', () => {
        chat([reply('a1', doc('doc_1', 'one'))]);
        const panel = panelFor();
        const other = document.createElement('section');
        document.body.append(other);
        other.append(panel);
        expect(panel.querySelectorAll('.aparte-art-panel__title')).toHaveLength(1);
        expect(panel.querySelectorAll('.aparte-art-panel__body')).toHaveLength(1);
        expect(source(panel)).toBe('one');
    });

    it('stops listening to the chat once it leaves the page', async () => {
        const source_ = chat([reply('a1', doc('doc_1', 'one'))]);
        const panel = panelFor();
        panel.remove();
        const reads = vi.spyOn(source_ as unknown as { getMessages: () => AparteMessage[] }, 'getMessages');
        source_.dispatchEvent(new CustomEvent('aparte-message-done', { bubbles: true }));
        await frame();
        expect(reads).not.toHaveBeenCalled();
    });

    it('puts its stylesheet on the page once', () => {
        chat([]);
        panelFor();
        panelFor();
        expect(document.head.querySelectorAll('#aparte-artifact-panel-styles')).toHaveLength(1);
    });

    it('is the class behind the tag', () => {
        expect(customElements.get('aparte-artifact-panel')).toBe(AparteArtifactPanel);
    });
});
