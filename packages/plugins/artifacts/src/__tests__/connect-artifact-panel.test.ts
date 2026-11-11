/**
 * `connectArtifactPanel()`: the card's Open button, the panel and the layout, wired once.
 *
 * Open shows that very version in the panel and opens the pane; Close folds it and gives
 * the focus back to the button that opened it. Opening by itself is an option, off unless
 * the app asks, and never on a screen that shows one pane at a time.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { aparteGlobalConfig, getSegmentRenderer } from '@aparte/core';
import type { AparteMessage, AparteSegment, AparteToolCallSegment } from '@aparte/core';
import { setupArtifacts, artifactFromToolCall } from '../index.js';
import { connectArtifactPanel } from '../panel.js';
import type { AparteArtifactPanel, ArtifactPanelSplit } from '../panel.js';

let teardown: (() => void) | null = null;
let n = 0;

const call = (documentId: string, content: string): AparteToolCallSegment => ({
    id: `seg-${++n}`, type: 'tool_call', status: 'resolved', result: 'ok',
    toolCall: { id: `call-${n}`, name: 'create_artifact', input: {} },
    structuredResult: { documentId, mimeType: 'text/markdown', title: 'Plan', content },
});
const reply = (id: string, ...segments: AparteSegment[]): AparteMessage => ({ id, role: 'assistant', content: '', timestamp: 0, segments }) as AparteMessage;
const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

type Chat = HTMLElement & { messages: AparteMessage[] };

/** A chat, a split and a panel, as an app lays them out. The split is a plain element with the two properties. */
function page(messages: AparteMessage[] = []): { chat: Chat; panel: AparteArtifactPanel; split: ArtifactPanelSplit } {
    const split = Object.assign(document.createElement('div'), { single: false, pane: 'start' as const }) as ArtifactPanelSplit;
    const chat = Object.assign(document.createElement('div'), { messages }) as Chat & { getMessages: () => AparteMessage[] };
    chat.getMessages = () => chat.messages;
    const panel = document.createElement('aparte-artifact-panel');
    split.append(chat, panel);
    document.body.append(split);
    return { chat, panel, split };
}

/** Draw a call's card in the chat, the way the bubble does, and return its Open button. */
function cardIn(chat: HTMLElement, segment: AparteToolCallSegment): HTMLButtonElement | null {
    const renderer = getSegmentRenderer('artifact')!;
    const artifact = artifactFromToolCall(segment);
    const host = document.createElement('div');
    host.innerHTML = renderer.render(artifact as never) as string;
    const element = host.firstElementChild as HTMLElement;
    chat.append(host);
    renderer.setup?.(element, artifact as never);
    return element.querySelector<HTMLButtonElement>('[data-action="open"]');
}

describe('connectArtifactPanel', () => {
    beforeEach(() => { teardown = setupArtifacts(); });
    afterEach(() => { teardown?.(); teardown = null; aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

    it('turns the card\'s Open button on, since it is what listens to it, and off again when undone', () => {
        const { chat, panel, split } = page();
        expect(cardIn(chat, call('doc_1', 'one'))).toBeNull();

        const disconnect = connectArtifactPanel({ chat, panel, split });
        expect(cardIn(chat, call('doc_1', 'one'))).not.toBeNull();

        disconnect();
        expect(cardIn(chat, call('doc_1', 'one'))).toBeNull();
    });

    it('with nothing to show, the split shows the chat alone', () => {
        const { chat, panel, split } = page();
        connectArtifactPanel({ chat, panel, split });
        expect(split.single).toBe(true);
        expect(split.pane).toBe('start');
    });

    it('Open shows that version in the panel, opens the pane and moves the focus to the title', () => {
        const first = call('doc_1', 'one');
        const { chat, panel, split } = page([reply('a1', first), reply('a2', call('doc_1', 'two'))]);
        connectArtifactPanel({ chat, panel, split });
        split.single = true;

        cardIn(chat, first)!.click();

        expect(panel.shownVersion).toMatchObject({ documentId: 'doc_1', index: 1, content: 'one' });
        expect(split.single).toBe(false);
        expect(split.pane).toBe('end');
        expect(document.activeElement).toBe(panel.querySelector('.aparte-art-panel__title'));
    });

    it('Close folds the pane and gives the focus back to the button that opened it', () => {
        const segment = call('doc_1', 'one');
        const { chat, panel, split } = page([reply('a1', segment)]);
        connectArtifactPanel({ chat, panel, split });
        const open = cardIn(chat, segment)!;
        open.click();

        panel.querySelector<HTMLButtonElement>('.aparte-art-panel__close')!.click();

        expect(split.single).toBe(true);
        expect(split.pane).toBe('start');
        expect(document.activeElement).toBe(open);
    });

    it('the panel can sit in the first pane', () => {
        const segment = call('doc_1', 'one');
        const { chat, panel, split } = page([reply('a1', segment)]);
        connectArtifactPanel({ chat, panel, split, pane: 'start' });
        cardIn(chat, segment)!.click();
        expect(split.pane).toBe('start');
        panel.querySelector<HTMLButtonElement>('.aparte-art-panel__close')!.click();
        expect(split.pane).toBe('end');
    });

    it('works with no split: the app shows and hides the panel from the two callbacks', () => {
        const segment = call('doc_1', 'one');
        const { chat, panel } = page([reply('a1', segment)]);
        const seen: string[] = [];
        connectArtifactPanel({ chat, panel, onOpen: () => seen.push('open'), onClose: () => seen.push('close') });
        cardIn(chat, segment)!.click();
        panel.querySelector<HTMLButtonElement>('.aparte-art-panel__close')!.click();
        expect(seen).toEqual(['open', 'close']);
    });

    it('does not open by itself unless asked', async () => {
        const { chat, panel, split } = page();
        connectArtifactPanel({ chat, panel, split });
        chat.messages = [reply('a1', call('doc_1', 'one'))];
        chat.dispatchEvent(new CustomEvent('aparte-message-done', { bubbles: true }));
        await frame(); await frame();
        expect(split.single).toBe(true);
    });

    it('autoOpen: a document written in a turn opens the pane, without taking the focus from the composer', async () => {
        const { chat, panel, split } = page();
        connectArtifactPanel({ chat, panel, split, autoOpen: true });
        const composer = document.createElement('textarea');
        document.body.append(composer);
        composer.focus();

        chat.messages = [reply('a1', call('doc_1', 'one'))];
        chat.dispatchEvent(new CustomEvent('aparte-message-done', { bubbles: true }));
        await frame(); await frame();

        expect(split.single).toBe(false);
        expect(split.pane).toBe('end');
        expect(panel.shownVersion?.content).toBe('one');
        expect(document.activeElement).toBe(composer);
    });

    it('autoOpen: a turn that wrote no document opens nothing', async () => {
        const { chat, panel, split } = page([reply('a1', call('doc_1', 'one'))]);
        connectArtifactPanel({ chat, panel, split, autoOpen: true });
        split.single = true;
        chat.messages = [...chat.messages, reply('a2', { id: 't', type: 'text', content: 'done' } as AparteSegment)];
        chat.dispatchEvent(new CustomEvent('aparte-message-done', { bubbles: true }));
        await frame(); await frame();
        expect(split.single).toBe(true);
    });

    it('autoOpen: a conversation that is opened is not news', async () => {
        const { chat, panel, split } = page();
        connectArtifactPanel({ chat, panel, split, autoOpen: true });
        chat.messages = [reply('a1', call('doc_1', 'one'))];
        chat.dispatchEvent(new CustomEvent('aparte-conversation-loaded', { bubbles: true }));
        await frame(); await frame();
        chat.dispatchEvent(new CustomEvent('aparte-message-done', { bubbles: true }));
        await frame(); await frame();
        expect(split.single).toBe(true);
    });

    it('autoOpen: on a screen that shows one pane at a time, the reader stays on the chat', async () => {
        const { chat, panel, split } = page();
        connectArtifactPanel({ chat, panel, split, autoOpen: true });
        split.setAttribute('data-stacked', '');
        chat.messages = [reply('a1', call('doc_1', 'one'))];
        chat.dispatchEvent(new CustomEvent('aparte-message-done', { bubbles: true }));
        await frame(); await frame();
        expect(split.pane).toBe('start');
        expect(split.single).toBe(true);
    });

    it('undone, it listens to nothing', () => {
        const segment = call('doc_1', 'one');
        const { chat, panel, split } = page([reply('a1', segment)]);
        const disconnect = connectArtifactPanel({ chat, panel, split });
        const open = cardIn(chat, segment)!;
        disconnect();
        split.single = true;
        open.click();
        expect(split.single).toBe(true);
    });
});
