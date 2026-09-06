// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationListItem } from '../aparte-conversation-list.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteConversationManager } from '../../../conversations/conversation-manager.js';

type ListEl = HTMLElement & { conversations: AparteConversationListItem[] };

function fakeManager(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        delete: vi.fn(async () => undefined),
        archive: vi.fn(async () => undefined),
        unarchive: vi.fn(async () => undefined),
        pin: vi.fn(async () => undefined),
        unpin: vi.fn(async () => undefined),
        updateTitle: vi.fn(async () => undefined),
    };
}

function register(manager: Record<string, unknown> | null): void {
    aparteGlobalConfig.setConversationManager(manager as unknown as AparteConversationManager);
}

function mount(items: AparteConversationListItem[], manage: boolean): ListEl {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    if (manage) el.setAttribute('manage', '');
    document.body.appendChild(el);
    el.conversations = items;
    return el;
}

const moreOf = (el: ListEl, id: string): HTMLElement =>
    el.querySelector<HTMLElement>(`[data-conv-id="${id}"] .aparte-conv-item__more`)!;
const choose = (el: ListEl, action: string): void => {
    el.querySelector<HTMLElement>(`[data-menu-action="${action}"]`)!.click();
};

afterEach(() => {
    document.body.innerHTML = '';
    register(null);
    vi.restoreAllMocks();
});

describe('aparte-conversation-list — `manage`', () => {
    it('finishes a delete through the registered conversation manager, once', () => {
        const manager = fakeManager();
        register(manager);
        const el = mount([{ id: 'c1', title: 'One' }], true);

        moreOf(el, 'c1').click();
        choose(el, 'delete');
        choose(el, 'confirm-delete');

        expect(manager['delete']).toHaveBeenCalledTimes(1);
        expect(manager['delete']).toHaveBeenCalledWith('c1');
    });

    it('finishes a pin, an archive and a rename the same way', () => {
        const manager = fakeManager();
        register(manager);
        const el = mount([{ id: 'c1', title: 'One' }], true);

        moreOf(el, 'c1').click();
        choose(el, 'pin');
        expect(manager['pin']).toHaveBeenCalledWith('c1');

        moreOf(el, 'c1').click();
        choose(el, 'archive');
        expect(manager['archive']).toHaveBeenCalledWith('c1');

        moreOf(el, 'c1').click();
        choose(el, 'rename');
        const input = el.querySelector<HTMLInputElement>('[data-rename-id]')!;
        input.value = 'Two';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(manager['updateTitle']).toHaveBeenCalledWith('c1', 'Two');
    });

    it('says so when the manager refuses the change, and leaves the row alone', async () => {
        const manager = fakeManager();
        manager['delete'] = vi.fn(async () => { throw new Error('the store is read-only'); });
        register(manager);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const el = mount([{ id: 'c1', title: 'One' }], true);

        moreOf(el, 'c1').click();
        choose(el, 'delete');
        choose(el, 'confirm-delete');
        await Promise.resolve();
        await Promise.resolve();

        expect(warn, 'a rejected write is reported, not swallowed').toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toContain('refused the change');
    });

    it('offers the pinned and archived rows the opposite call', () => {
        const manager = fakeManager();
        register(manager);
        const el = mount([{ id: 'c1', title: 'One', pinnedAt: 1, archivedAt: 1 }], true);

        moreOf(el, 'c1').click();
        choose(el, 'pin');
        expect(manager['unpin']).toHaveBeenCalledWith('c1');

        moreOf(el, 'c1').click();
        choose(el, 'archive');
        expect(manager['unarchive']).toHaveBeenCalledWith('c1');
    });

    it('stands down when a listener takes the gesture with preventDefault()', () => {
        const manager = fakeManager();
        register(manager);
        const el = mount([{ id: 'c1', title: 'One' }], true);
        el.addEventListener('aparte-conversation-delete', (e) => { e.preventDefault(); });

        moreOf(el, 'c1').click();
        choose(el, 'delete');
        choose(el, 'confirm-delete');

        expect(manager['delete']).not.toHaveBeenCalled();
    });

    it('without `manage`, fires the event and stops', () => {
        const manager = fakeManager();
        register(manager);
        const el = mount([{ id: 'c1', title: 'One' }], false);
        const seen: unknown[] = [];
        el.addEventListener('aparte-conversation-delete', (e) => { seen.push((e as CustomEvent).detail); });

        moreOf(el, 'c1').click();
        choose(el, 'delete');
        choose(el, 'confirm-delete');

        expect(seen).toEqual([{ id: 'c1' }]);
        expect(manager['delete']).not.toHaveBeenCalled();
    });

    it('with `manage` and no manager registered, says so once and names the call', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const el = mount([{ id: 'c1', title: 'One' }], true);

        moreOf(el, 'c1').click();
        choose(el, 'pin');
        moreOf(el, 'c1').click();
        choose(el, 'archive');

        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toContain('setConversationManager');
    });
});
