import React, { useEffect } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import {
    aparteGlobalConfig,
    registerAllComponents,
    type AparteConversation,
    type AparteConversationManager,
    type AparteStorageAdapter,
} from '@aparte/core';
import { AparteChat, AparteConversationList, AparteOption, AparteSelect, useConversationManager } from '../index';

/*
 * The issue's case, end to end: a React app shows its saved conversations with
 * `<AparteConversationList>`, bound to `useConversationManager()` — the rows are a prop, the
 * active conversation is a prop, and each gesture is a callback. The example in the docs
 * (`components/conversation-list`) is this file's `Sidebar`, so what it says is what runs.
 *
 * Real everything: the hook, the core manager, the list, the chat and its conversation
 * controller. Only the store is faked, in memory.
 */

registerAllComponents();

const conversation = (id: string, title: string, text: string, updatedAt: number): AparteConversation => ({
    id,
    title,
    createdAt: updatedAt,
    updatedAt,
    messages: [{ id: `${id}-m1`, role: 'assistant', content: text, timestamp: updatedAt }],
});

/** A store that keeps what it is given, and says what it was asked. */
function memoryStore(...saved: AparteConversation[]): AparteStorageAdapter & { rows: Map<string, AparteConversation>; deleted: string[] } {
    const rows = new Map(saved.map((c) => [c.id, c]));
    const deleted: string[] = [];
    return {
        rows,
        deleted,
        loadAll: async () => [...rows.values()],
        save: async (c) => { rows.set(c.id, c); },
        delete: async (id) => { deleted.push(id); rows.delete(id); },
    };
}

afterEach(() => {
    cleanup();
    // `init` registers its manager on the page-wide config: the next test starts without one.
    aparteGlobalConfig.setConversationManager(null as unknown as AparteConversationManager);
});

const titles = (container: HTMLElement): string[] =>
    [...container.querySelectorAll<HTMLElement>('[data-select-id]')].map((row) => row.textContent?.trim() ?? '');

/** What a person does: open a row's `⋯` menu, and choose one of its items. */
const openMenu = (container: HTMLElement, id: string): void => {
    act(() => container.querySelector<HTMLElement>(`[data-conv-id="${id}"] .aparte-conv-item__more`)!.click());
};
const choose = (container: HTMLElement, action: string): void => {
    act(() => container.querySelector<HTMLElement>(`[data-menu-action="${action}"]`)!.click());
};

/** The docs' example: the manager's rows and active id on the list, next to the chat. */
function Sidebar({ store, onDelete }: { store: AparteStorageAdapter; onDelete?: (id: string) => void }) {
    const manager = useConversationManager();
    useEffect(() => { void manager.init(store); }, []);
    return (
        <>
            <AparteConversationList
                conversations={manager.activeConversations}
                active-id={manager.activeId}
                onConversationRename={(detail) => void manager.updateTitle(detail.id, detail.title)}
                onConversationPin={(detail) => void manager.pin(detail.id)}
                onConversationDelete={(detail) => { onDelete?.(detail.id); void manager.delete(detail.id); }}
            />
            <AparteChat />
        </>
    );
}

const STORE = () => memoryStore(
    conversation('c1', 'Trip to Lisbon', 'Pack light.', 1_000),
    conversation('c2', 'Tax return', 'Keep the receipts.', 2_000),
);

describe('<AparteConversationList> bound to useConversationManager()', () => {
    it('draws the manager\'s conversations, newest first', async () => {
        const { container } = render(<Sidebar store={STORE()} />);
        await waitFor(() => expect(titles(container)).toHaveLength(2));
        expect(titles(container)[0]).toContain('Tax return');
        expect(titles(container)[1]).toContain('Trip to Lisbon');
    });

    it('opens the conversation in the chat when a row is clicked, and marks it active', async () => {
        const { container } = render(<Sidebar store={STORE()} />);
        await waitFor(() => expect(titles(container)).toHaveLength(2));
        act(() => container.querySelector<HTMLElement>('[data-select-id="c1"]')!.click());
        await waitFor(() => expect(container.querySelector('aparte-conversation-list')!.getAttribute('active-id')).toBe('c1'));
        await waitFor(() => expect(container.querySelector('aparte-chat-bubble')?.textContent).toContain('Pack light.'));
    });

    it('hands the list a new array when the manager changes, so a rename shows', async () => {
        const store = STORE();
        const { container } = render(<Sidebar store={store} />);
        await waitFor(() => expect(titles(container)).toHaveLength(2));
        openMenu(container, 'c1');
        choose(container, 'rename');
        const input = container.querySelector<HTMLInputElement>('[data-rename-id]')!;
        input.value = 'Lisbon, again';
        act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
        await waitFor(() => expect(titles(container).join('|')).toContain('Lisbon, again'));
        expect(store.rows.get('c1')!.title).toBe('Lisbon, again');
    });

    it('calls onConversationDelete with the id, and the row goes when the manager has deleted it', async () => {
        const store = STORE();
        const onDelete = vi.fn();
        const { container } = render(<Sidebar store={store} onDelete={onDelete} />);
        await waitFor(() => expect(titles(container)).toHaveLength(2));
        openMenu(container, 'c2');
        choose(container, 'delete');
        choose(container, 'confirm-delete');
        expect(onDelete).toHaveBeenCalledWith('c2');
        await waitFor(() => expect(titles(container)).toHaveLength(1));
        expect(store.deleted).toEqual(['c2']);
    });

    it('lets `manage` finish a gesture with no callback: the manager the hook registered does it', async () => {
        const store = STORE();
        function Managed() {
            const manager = useConversationManager();
            useEffect(() => { void manager.init(store); }, []);
            return <AparteConversationList manage conversations={manager.activeConversations} active-id={manager.activeId} />;
        }
        const { container } = render(<Managed />);
        await waitFor(() => expect(titles(container)).toHaveLength(2));
        openMenu(container, 'c1');
        choose(container, 'pin');
        await waitFor(() => expect(store.rows.get('c1')!.pinnedAt).toBeTruthy());
    });

    it('keeps the gesture for the app when a callback calls event.preventDefault(): `manage` stands down', async () => {
        const store = STORE();
        function Careful() {
            const manager = useConversationManager();
            useEffect(() => { void manager.init(store); }, []);
            return (
                <AparteConversationList
                    manage
                    conversations={manager.activeConversations}
                    active-id={manager.activeId}
                    onConversationPin={(_detail, event) => event.preventDefault()}
                />
            );
        }
        const { container } = render(<Careful />);
        await waitFor(() => expect(titles(container)).toHaveLength(2));
        openMenu(container, 'c1');
        choose(container, 'pin');
        // Nothing was saved: the callback took the gesture back.
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
        expect(store.rows.get('c1')!.pinnedAt).toBeUndefined();
    });
});

describe('<AparteSelect> with <AparteOption>, the other element of the docs\' example', () => {
    it('calls onSelectChange with the picked value when an option is chosen', () => {
        const onChange = vi.fn();
        const { container } = render(
            <AparteSelect placeholder="Pick a model" onSelectChange={onChange}>
                <AparteOption value="gpt-4o-mini">GPT-4o mini</AparteOption>
                <AparteOption value="gpt-4o">GPT-4o</AparteOption>
            </AparteSelect>,
        );
        act(() => container.querySelector<HTMLElement>('aparte-option[value="gpt-4o"]')!.click());
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0]![0]).toMatchObject({ value: 'gpt-4o' });
    });
});
