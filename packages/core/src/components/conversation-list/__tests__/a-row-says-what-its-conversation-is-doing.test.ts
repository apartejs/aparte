// @vitest-environment jsdom
/**
 * A row says what its conversation is doing.
 *
 * While an AI answered, the sidebar showed nothing: the conversation looked the same
 * answering as finished. Chat apps mark it — a pulse on the title or a dot — and mark the
 * one that waits for the person. A row now carries its conversation's state: `running`
 * (the title shimmers) or `waiting` (a mark beside the title), with words a screen
 * reader hears. The state is data on the row (`data-status`) and the look is CSS, so a
 * site that wants a dot for `running` writes it; the mark is an empty slot until a state
 * draws it. Set by `setConversationStatus`, or by the `aparte-conversation-status` event
 * the conversation controller sends — no code in the host.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationListItem } from '../aparte-conversation-list.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import { forgetConversationStatuses, tellConversationStatus } from '../../../conversations/conversation-status.js';

type ListEl = HTMLElement & {
    conversations: AparteConversationListItem[];
    setConversationStatus(id: string, status: 'running' | 'waiting' | null): void;
    getConversationStatus(id: string): 'running' | 'waiting' | null;
};

async function mount(): Promise<ListEl> {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    document.body.appendChild(el);
    await vi.waitFor(() => expect(typeof el.setConversationStatus).toBe('function'));
    el.conversations = [
        { id: 'c1', title: 'Trip to Lake Varden', updatedAt: Date.now() },
        { id: 'c2', title: 'Sourdough', updatedAt: Date.now() - 1000 },
    ];
    return el;
}

const row = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-conv-id="${id}"]`)!;
const title = (el: HTMLElement, id: string) => row(el, id).querySelector<HTMLElement>('.aparte-conv-item__title')!;
const heard = (el: HTMLElement, id: string) => row(el, id).querySelector('.aparte-conv-item__state')?.textContent ?? '';

afterEach(() => {
    aparteGlobalConfig.resetLocale();
    // A state is page-wide (a list that connects late reads it): each case starts clean.
    forgetConversationStatuses();
    document.body.innerHTML = '';
});

describe('a conversation row and its state', () => {
    it('running: the title shimmers, and a screen reader hears it', async () => {
        const el = await mount();
        el.setConversationStatus('c1', 'running');
        expect(row(el, 'c1').getAttribute('data-status')).toBe('running');
        expect(title(el, 'c1').classList.contains('aparte-shimmer')).toBe(true);
        expect(heard(el, 'c1')).toBe('Answering');
        expect(row(el, 'c2').hasAttribute('data-status')).toBe(false);
    });

    it('waiting: no shimmer, the mark beside the title, and the words', async () => {
        const el = await mount();
        el.setConversationStatus('c2', 'waiting');
        expect(row(el, 'c2').getAttribute('data-status')).toBe('waiting');
        expect(title(el, 'c2').classList.contains('aparte-shimmer')).toBe(false);
        expect(row(el, 'c2').querySelector('.aparte-conv-item__status')).not.toBeNull();
        expect(heard(el, 'c2')).toBe('Waiting for you');
    });

    it('null: back to a plain row', async () => {
        const el = await mount();
        el.setConversationStatus('c1', 'running');
        el.setConversationStatus('c1', null);
        expect(row(el, 'c1').hasAttribute('data-status')).toBe(false);
        expect(title(el, 'c1').classList.contains('aparte-shimmer')).toBe(false);
        expect(heard(el, 'c1')).toBe('');
        expect(el.getConversationStatus('c1')).toBeNull();
    });

    it('is patched in place: the row the reader may be on is the same element', async () => {
        const el = await mount();
        const before = row(el, 'c1');
        el.setConversationStatus('c1', 'running');
        expect(row(el, 'c1')).toBe(before);
    });

    it('outlives a re-render, and reaches a row drawn later', async () => {
        const el = await mount();
        el.setConversationStatus('c1', 'running');
        el.setConversationStatus('c3', 'waiting');
        el.conversations = [...el.conversations, { id: 'c3', title: 'Invoice', updatedAt: Date.now() - 2000 }];
        expect(row(el, 'c1').getAttribute('data-status')).toBe('running');
        expect(row(el, 'c3').getAttribute('data-status')).toBe('waiting');
        expect(el.getConversationStatus('c3')).toBe('waiting');
    });

    it('takes it from the aparte-conversation-status event, the controller\'s', async () => {
        const el = await mount();
        window.dispatchEvent(new CustomEvent('aparte-conversation-status', { detail: { id: 'c2', status: 'running' } }));
        expect(row(el, 'c2').getAttribute('data-status')).toBe('running');
        window.dispatchEvent(new CustomEvent('aparte-conversation-status', { detail: { id: 'c2', status: null } }));
        expect(row(el, 'c2').hasAttribute('data-status')).toBe(false);
    });

    it('says it in the reader\'s language', async () => {
        const el = await mount();
        el.setConversationStatus('c1', 'running');
        aparteGlobalConfig.extendLocale({ conversationRunning: 'Réponse en cours' });
        await vi.waitFor(() => expect(heard(el, 'c1')).toBe('Réponse en cours'));
    });
});

describe('a conversation row\'s state, as it is drawn', async () => {
    const { readAparteStylesheet } = await import('../../../__tests__/read-stylesheet.js');
    const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, ' ');
    const blockAfter = (pattern: RegExp): string => {
        const m = css.match(pattern);
        expect(m, String(pattern)).not.toBeNull();
        const at = css.indexOf('{', m!.index!);
        return css.slice(at, css.indexOf('}', at));
    };

    it('keeps a running title readable on a lifted row: the shimmer\'s base is not the muted ink there', () => {
        // Muted ink on the active / hovered row's ground is 4.23:1, an AA failure the row's
        // own hover rule exists to avoid; a running conversation is almost always the active one.
        const lifted = blockAfter(/\.aparte-conv-item--active[^{]*\.aparte-conv-item__title[^{]*\{|\.aparte-conv-item:hover[^{]*,[^{]*\.aparte-conv-item--active[^{]*\{/);
        expect(lifted).toMatch(/--aparte-shimmer-base:/);
    });

    it('draws the waiting mark in an ink that holds 3:1, and a shape that survives forced colours', () => {
        expect(blockAfter(/\.aparte-conv-item__status\s*\{/)).toMatch(/background:\s*var\(--aparte-primary-ink\)/);
        const forced = css.slice(css.search(/@media\s*\(forced-colors:\s*active\)\s*\{[^@]*\.aparte-conv-item__status/));
        expect(forced).toMatch(/\.aparte-conv-item__status[^{]*\{[^}]*border:/);
    });

    it('marks a running row with the dot where the shimmer cannot say it: forced colours, reduced motion', () => {
        for (const media of ['forced-colors:\\s*active', 'prefers-reduced-motion:\\s*reduce']) {
            const at = css.search(new RegExp(`@media\\s*\\(${media}\\)\\s*\\{[^@]*\\.aparte-conv-item\\[data-status="running"\\]\\s*\\.aparte-conv-item__status`));
            expect(at, media).toBeGreaterThan(-1);
        }
    });
});

describe('a list that connects late', () => {
    it('draws the state told before it was on the page: a drawer, a remount', async () => {
        // The controller's path: kept page-wide, then announced.
        tellConversationStatus('c2', 'waiting');
        const el = await mount();
        expect(row(el, 'c2').getAttribute('data-status')).toBe('waiting');
        el.setConversationStatus('c2', null);
    });
});
