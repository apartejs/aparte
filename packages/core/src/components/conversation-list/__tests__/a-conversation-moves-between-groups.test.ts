// @vitest-environment jsdom
/**
 * A conversation moves between the app's groups (projects, folders): "Move to…" in its menu,
 * "Remove from …" for a row in a group, or a drag onto another group. The list moves nothing:
 * it says where, and the app assigns `conversations` again.
 *
 * Only with `moveTargets`. Without it the list is the one it was before the property existed:
 * the same menu, the same rows, nothing draggable. The market (ChatGPT, Claude, LibreChat,
 * Open WebUI, Perplexity) moves a chat from its row's menu, choosing from the destinations;
 * several also drag it onto a folder, marked whole while a drop there is allowed.
 *
 * The drag here is synthetic (jsdom has no drag and drop): what a browser does with it is
 * `e2e/tests/conversation-move.spec.ts`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationGroup, AparteConversationListItem, AparteConversationMoveDetail } from '../aparte-conversation-list.js';

type ListEl = HTMLElement & { conversations: AparteConversationListItem[]; moveTargets: AparteConversationGroup[] };

const LAUNCH = { key: 'p-launch', label: 'Launch' };
const DOCS = { key: 'p-docs', label: 'Docs' };
const ITEMS: AparteConversationListItem[] = [
    { id: 'c1', title: 'Launch plan', group: LAUNCH },
    { id: 'c2', title: 'API pages', group: DOCS },
    { id: 'c3', title: 'A quick question', updatedAt: Date.now() },
];

function mount(items: AparteConversationListItem[] = ITEMS, targets?: AparteConversationGroup[]): ListEl {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    document.body.appendChild(el);
    if (targets) el.moveTargets = targets;
    el.conversations = items;
    return el;
}

const rowOf = (el: ListEl, id: string): HTMLElement => el.querySelector<HTMLElement>(`[data-conv-id="${id}"]`)!;
const openMenu = (el: ListEl, id: string): HTMLElement => {
    rowOf(el, id).querySelector<HTMLElement>('.aparte-conv-item__more')!.click();
    return el.querySelector<HTMLElement>('[role="menu"]')!;
};
const actionsOf = (menu: HTMLElement): (string | undefined)[] =>
    Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((b) => b.dataset['menuAction']);
const moves = (el: ListEl): AparteConversationMoveDetail[] => {
    const seen: AparteConversationMoveDetail[] = [];
    el.addEventListener('aparte-conversation-move', (e) => seen.push((e as CustomEvent<AparteConversationMoveDetail>).detail));
    return seen;
};
/** A drag event as a browser sends it, with the data transfer jsdom does not have. */
const drag = (target: Element, type: string): Event => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const data = new Map<string, string>();
    Object.defineProperty(event, 'dataTransfer', {
        value: { effectAllowed: 'all', dropEffect: 'none', setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '' },
    });
    target.dispatchEvent(event);
    return event;
};
/** A pointer pressed on `target`, the way every real drag begins. */
const press = (target: Element): void => {
    target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
};
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => { document.body.innerHTML = ''; });

describe('without moveTargets: the list it was', () => {
    it('the same menu, and no row to drag', () => {
        const el = mount();
        expect(actionsOf(openMenu(el, 'c1'))).toEqual(['rename', 'pin', 'archive', 'delete']);
        expect(el.querySelector('[draggable]')).toBeNull();
        expect(el.querySelector('[data-group-key]')?.getAttribute('data-group-key')).toBe('p-launch');
    });

    it('a drag starts nothing and lands nowhere', () => {
        const el = mount();
        const seen = moves(el);
        drag(rowOf(el, 'c1'), 'dragstart');
        const over = drag(rowOf(el, 'c2'), 'dragover');
        drag(rowOf(el, 'c2'), 'drop');
        expect(over.defaultPrevented).toBe(false);
        expect(seen).toEqual([]);
    });
});

describe('with moveTargets: the menu', () => {
    it('offers "Move to…" after pin, and "Remove from …" for a row in a group', () => {
        const el = mount(ITEMS, [LAUNCH, DOCS]);
        const menu = openMenu(el, 'c1');
        expect(actionsOf(menu)).toEqual(['rename', 'pin', 'move', 'ungroup', 'archive', 'delete']);
        expect(menu.textContent).toContain('Move to…');
        expect(menu.textContent).toContain('Remove from “Launch”');
    });

    it('a row in no group has nothing to be removed from', () => {
        const el = mount(ITEMS, [LAUNCH, DOCS]);
        expect(actionsOf(openMenu(el, 'c3'))).toEqual(['rename', 'pin', 'move', 'archive', 'delete']);
    });

    it('lists every target but the row\'s own group, in the same menu, focused on the first', () => {
        const el = mount(ITEMS, [LAUNCH, DOCS, { key: 'p-ops', label: 'Ops' }]);
        const menu = openMenu(el, 'c1');
        menu.querySelector<HTMLElement>('[data-menu-action="move"]')!.click();
        const open = el.querySelector<HTMLElement>('[role="menu"]')!;
        expect(open).toBe(menu);
        expect(actionsOf(open)).toEqual(['move-to', 'move-to']);
        expect([...open.querySelectorAll<HTMLElement>('[data-move-to]')].map((b) => b.textContent)).toEqual(['Docs', 'Ops']);
        expect(open.getAttribute('aria-label')).toBe('Move “Launch plan” to');
        expect(document.activeElement).toBe(open.querySelector('[data-move-to="p-docs"]'));
    });

    it('choosing a group says the move, from the group it leaves to the one chosen, and moves nothing', () => {
        const el = mount(ITEMS, [LAUNCH, DOCS]);
        const seen = moves(el);
        openMenu(el, 'c1').querySelector<HTMLElement>('[data-menu-action="move"]')!.click();
        el.querySelector<HTMLElement>('[data-move-to="p-docs"]')!.click();
        expect(seen).toEqual([{ id: 'c1', from: 'p-launch', to: 'p-docs' }]);
        expect(el.querySelector('[role="menu"]')).toBeNull();
        expect(rowOf(el, 'c1').closest('[data-group-key]')?.getAttribute('data-group-key')).toBe('p-launch');
    });

    it('"Remove from …" moves it out of its group, to null', () => {
        const el = mount(ITEMS, [LAUNCH, DOCS]);
        const seen = moves(el);
        openMenu(el, 'c2').querySelector<HTMLElement>('[data-menu-action="ungroup"]')!.click();
        expect(seen).toEqual([{ id: 'c2', from: 'p-docs', to: null }]);
    });

    it('no "Move to…" when the only target is the group it is in', () => {
        const el = mount(ITEMS, [LAUNCH]);
        expect(actionsOf(openMenu(el, 'c1'))).toEqual(['rename', 'pin', 'ungroup', 'archive', 'delete']);
    });

    it('skips a target that is not a group, and keeps the array it was given', () => {
        const targets = [DOCS, null as unknown as AparteConversationGroup, { key: 3 } as unknown as AparteConversationGroup];
        const el = mount(ITEMS, targets);
        expect(el.moveTargets).toBe(targets);
        const menu = openMenu(el, 'c1');
        menu.querySelector<HTMLElement>('[data-menu-action="move"]')!.click();
        expect([...el.querySelectorAll<HTMLElement>('[data-move-to]')].map((b) => b.dataset['moveTo'])).toEqual(['p-docs']);
    });
});

describe('with moveTargets: a drag', () => {
    it('rows can be dragged, and a drop on another group\'s row moves the conversation there', () => {
        const el = mount(ITEMS, [LAUNCH, DOCS]);
        const seen = moves(el);
        expect(rowOf(el, 'c1').getAttribute('draggable')).toBe('true');
        drag(rowOf(el, 'c1'), 'dragstart');
        expect(rowOf(el, 'c1').classList.contains('aparte-conv-item--dragging')).toBe(true);
        const over = drag(rowOf(el, 'c2'), 'dragover');
        expect(over.defaultPrevented).toBe(true);
        expect(rowOf(el, 'c2').closest('.aparte-conv-group')!.classList.contains('aparte-conv-group--drop')).toBe(true);
        drag(rowOf(el, 'c2'), 'drop');
        expect(seen).toEqual([{ id: 'c1', from: 'p-launch', to: 'p-docs' }]);
        expect(el.querySelector('.aparte-conv-group--drop, .aparte-conv-item--dragging')).toBeNull();
    });

    it('entering a group a drop would land in is allowed too (WebKit drops only where dragenter was)', () => {
        const el = mount(ITEMS, [LAUNCH, DOCS]);
        drag(rowOf(el, 'c1'), 'dragstart');
        expect(drag(rowOf(el, 'c2'), 'dragenter').defaultPrevented, 'another project').toBe(true);
        expect(drag(rowOf(el, 'c1'), 'dragenter').defaultPrevented, 'its own').toBe(false);
    });

    it('a drop on a date group takes it out of its group', () => {
        const el = mount(ITEMS, [LAUNCH, DOCS]);
        const seen = moves(el);
        drag(rowOf(el, 'c1'), 'dragstart');
        drag(rowOf(el, 'c3'), 'dragover');
        drag(rowOf(el, 'c3'), 'drop');
        expect(seen).toEqual([{ id: 'c1', from: 'p-launch', to: null }]);
    });

    it('nothing is marked, and nothing said, over its own group or a group that is not a target', () => {
        const el = mount([...ITEMS, { id: 'c4', title: 'Elsewhere', group: { key: 'p-x', label: 'X' } }], [LAUNCH, DOCS]);
        const seen = moves(el);
        drag(rowOf(el, 'c1'), 'dragstart');
        for (const id of ['c1', 'c4']) {
            const over = drag(rowOf(el, id), 'dragover');
            expect(over.defaultPrevented, `over ${id}`).toBe(false);
            drag(rowOf(el, id), 'drop');
        }
        expect(el.querySelector('.aparte-conv-group--drop')).toBeNull();
        expect(seen).toEqual([]);
    });

    it('a render asked for during the drag waits for its end, and a drop draws what the app assigns at once', () => {
        const el = mount(ITEMS, [LAUNCH, DOCS]);
        el.addEventListener('aparte-conversation-move', (e) => {
            const { id, to } = (e as CustomEvent<AparteConversationMoveDetail>).detail;
            el.conversations = el.conversations.map((c) => (c.id === id ? { ...c, group: to === 'p-docs' ? DOCS : LAUNCH } : c));
        });
        drag(rowOf(el, 'c1'), 'dragstart');
        el.conversations = [...ITEMS];
        // Held: the row being dragged is still the one on the page.
        expect(rowOf(el, 'c1').classList.contains('aparte-conv-item--dragging')).toBe(true);
        drag(rowOf(el, 'c2'), 'dragover');
        drag(rowOf(el, 'c2'), 'drop');
        expect(rowOf(el, 'c1').closest('[data-group-key]')?.getAttribute('data-group-key')).toBe('p-docs');
    });

    // A real drag starts with a press, and the list holds every render while a pointer is down
    // (a row replaced under a press loses its click). The drag ends that press differently in
    // each engine: Chromium sends `pointercancel` as the drag starts, WebKit sends nothing at
    // all, neither `pointerup` nor `pointercancel`, so a hold waiting for one never ended there
    // and the moved row stayed where it was until the next click anywhere.
    it.each([
        ['WebKit: nothing after the press', [] as string[]],
        ['Chromium: pointercancel as the drag starts', ['pointercancel']],
    ])('a drag begun with a press lands where the app puts it (%s)', async (_engine, afterStart) => {
        const el = mount(ITEMS, [LAUNCH, DOCS]);
        el.addEventListener('aparte-conversation-move', (e) => {
            const { id, to } = (e as CustomEvent<AparteConversationMoveDetail>).detail;
            el.conversations = el.conversations.map((c) => (c.id === id ? { ...c, group: to === 'p-docs' ? DOCS : LAUNCH } : c));
        });
        press(rowOf(el, 'c1'));
        const source = rowOf(el, 'c1');
        drag(source, 'dragstart');
        for (const type of afterStart) window.dispatchEvent(new Event(type));
        // A drag spans tasks: the pointer travels before it drops.
        await tick();
        drag(rowOf(el, 'c2'), 'dragenter');
        drag(rowOf(el, 'c2'), 'dragover');
        drag(rowOf(el, 'c2'), 'drop');
        drag(source, 'dragend');
        expect(rowOf(el, 'c1').closest('[data-group-key]')?.getAttribute('data-group-key')).toBe('p-docs');
    });

    it('any drag out of the list ends its press: a list with nothing to move draws what is assigned after it', async () => {
        const el = mount(ITEMS);
        // Text dragged out of a row's title: not a move, but a press all the same.
        press(rowOf(el, 'c1'));
        drag(rowOf(el, 'c1'), 'dragstart');
        await tick();
        drag(rowOf(el, 'c1'), 'dragend');
        el.conversations = [...ITEMS, { id: 'c9', title: 'Added after the drag' }];
        expect(rowOf(el, 'c9')).not.toBeNull();
    });

    it('a drag that ends anywhere else (Escape included) leaves nothing marked and says nothing', () => {
        const el = mount(ITEMS, [LAUNCH, DOCS]);
        const seen = moves(el);
        drag(rowOf(el, 'c1'), 'dragstart');
        drag(rowOf(el, 'c2'), 'dragover');
        drag(rowOf(el, 'c1'), 'dragend');
        expect(el.querySelector('.aparte-conv-group--drop, .aparte-conv-item--dragging')).toBeNull();
        expect(seen).toEqual([]);
    });
});
