// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationListItem } from '../aparte-conversation-list.js';

type ListEl = HTMLElement & { conversations: AparteConversationListItem[] };

function mount(items: AparteConversationListItem[]): ListEl {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    document.body.appendChild(el);
    el.conversations = items;
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('aparte-conversation-list — archive/delete keyboard reachability (WCAG 2.1.1)', () => {
    it('renders the archive and delete actions with tabindex 0 (focusable)', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        const archive = el.querySelector<HTMLElement>('.aparte-conv-item__archive');
        const del = el.querySelector<HTMLElement>('.aparte-conv-item__delete');
        expect(archive).not.toBeNull();
        expect(del).not.toBeNull();
        expect(archive!.tabIndex).toBe(0); // was -1 → unreachable by keyboard
        expect(del!.tabIndex).toBe(0);
    });
});
