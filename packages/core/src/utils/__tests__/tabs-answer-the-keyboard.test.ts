// @vitest-environment jsdom
/**
 * `enhanceTabs(tablist)` — the WAI-ARIA tabs pattern, over the kit's markup.
 *
 * Six hand-written copies existed, each with its own gap: the artifact card handled
 * right-to-left and disabled tabs, the elicitation chips right-to-left only, the agent
 * template neither, the site's preview frame the side arrows and nothing else. One copy,
 * here.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { enhanceTabs, type AparteTabChangeDetail } from '../tabs.js';

const releases: Array<() => void> = [];
afterEach(() => {
    for (const release of releases.splice(0)) release();
    document.body.innerHTML = '';
});

function markup(labels: string[], selected = 0, extra = ''): string {
    return `
        <div class="aparte-tabs" role="tablist" aria-label="View" id="list" ${extra}>
            ${labels.map((label, i) => `<button type="button" class="aparte-tabs__tab" role="tab" id="t${i}" aria-controls="p${i}"${i === selected ? ' aria-selected="true"' : ''}>${label}</button>`).join('')}
        </div>
        ${labels.map((label, i) => `<div class="aparte-tabs__panel" role="tabpanel" id="p${i}" aria-labelledby="t${i}">${label} panel</div>`).join('')}`;
}

function mount(labels = ['Preview', 'Code', 'Logs'], options: Parameters<typeof enhanceTabs>[1] = {}, selected = 0, extra = '') {
    document.body.innerHTML = markup(labels, selected, extra);
    const list = document.getElementById('list')!;
    releases.push(enhanceTabs(list, options));
    return {
        list,
        tabs: [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')],
        panels: [...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')],
    };
}

const key = (target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
};
const selectedOf = (tabs: HTMLElement[]): number => tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
const shown = (panels: HTMLElement[]): string[] => panels.filter((p) => !p.hidden).map((p) => p.id);

describe('enhanceTabs — the state', () => {
    it('is one tab stop: the selected tab holds it, and only its panel shows', () => {
        const { tabs, panels } = mount(['A', 'B', 'C'], {}, 1);
        expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
        expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
        expect(shown(panels)).toEqual(['p1']);
    });

    it('with no tab marked, selects the first that can be', () => {
        document.body.innerHTML = markup(['A', 'B'], -1);
        const list = document.getElementById('list')!;
        (list.querySelector('#t0') as HTMLButtonElement).disabled = true;
        releases.push(enhanceTabs(list));
        expect(list.querySelector('#t1')!.getAttribute('aria-selected')).toBe('true');
        expect(shown([...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')])).toEqual(['p1']);
    });

    it('finds its panels in a tree that is not in the document yet', () => {
        const holder = document.createElement('div');
        holder.innerHTML = markup(['A', 'B']);
        releases.push(enhanceTabs(holder.querySelector<HTMLElement>('[role="tablist"]')!));
        expect(holder.querySelector<HTMLElement>('#p1')!.hidden).toBe(true);
        holder.querySelector<HTMLElement>('#t1')!.click();
        expect(holder.querySelector<HTMLElement>('#p0')!.hidden).toBe(true);
        expect(holder.querySelector<HTMLElement>('#p1')!.hidden).toBe(false);
    });
});

describe('enhanceTabs — the keys', () => {
    it('ArrowRight and ArrowLeft move the selection and the focus with it, and wrap', () => {
        const { tabs, panels } = mount();
        tabs[0]!.focus();
        expect(key(tabs[0]!, 'ArrowRight').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(tabs[1]);
        expect(selectedOf(tabs)).toBe(1);
        expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
        expect(shown(panels)).toEqual(['p1']);
        key(tabs[1]!, 'ArrowLeft');
        key(tabs[0]!, 'ArrowLeft');
        expect(selectedOf(tabs), 'left of the first is the last').toBe(2);
        key(tabs[2]!, 'ArrowRight');
        expect(selectedOf(tabs), 'right of the last is the first').toBe(0);
    });

    it('Home and End reach the first and the last', () => {
        const { tabs } = mount();
        key(tabs[0]!, 'End');
        expect(selectedOf(tabs)).toBe(2);
        expect(document.activeElement).toBe(tabs[2]);
        key(tabs[2]!, 'Home');
        expect(selectedOf(tabs)).toBe(0);
    });

    it('in a right-to-left row, ArrowLeft is forward', () => {
        const { list, tabs } = mount();
        list.style.direction = 'rtl';
        key(tabs[0]!, 'ArrowLeft');
        expect(selectedOf(tabs)).toBe(1);
        key(tabs[1]!, 'ArrowRight');
        expect(selectedOf(tabs)).toBe(0);
    });

    it('a vertical list moves with ArrowDown and ArrowUp, and leaves the side arrows alone', () => {
        const { tabs } = mount(['A', 'B', 'C'], {}, 0, 'aria-orientation="vertical"');
        key(tabs[0]!, 'ArrowDown');
        expect(selectedOf(tabs)).toBe(1);
        key(tabs[1]!, 'ArrowUp');
        expect(selectedOf(tabs)).toBe(0);
        expect(key(tabs[0]!, 'ArrowRight').defaultPrevented).toBe(false);
        expect(selectedOf(tabs)).toBe(0);
    });

    it('a horizontal list leaves the up and down arrows to the page', () => {
        const { tabs } = mount();
        expect(key(tabs[0]!, 'ArrowDown').defaultPrevented).toBe(false);
        expect(selectedOf(tabs)).toBe(0);
    });

    it('skips a tab that is disabled, aria-disabled or hidden', () => {
        const { tabs } = mount(['A', 'B', 'C', 'D', 'E']);
        tabs[1]!.disabled = true;
        tabs[2]!.setAttribute('aria-disabled', 'true');
        tabs[4]!.hidden = true;
        key(tabs[0]!, 'ArrowRight');
        expect(selectedOf(tabs)).toBe(3);
        key(tabs[3]!, 'ArrowRight');
        expect(selectedOf(tabs), 'E is hidden: round to A').toBe(0);
        key(tabs[0]!, 'End');
        expect(selectedOf(tabs)).toBe(3);
        key(tabs[3]!, 'ArrowLeft');
        expect(selectedOf(tabs)).toBe(0);
    });

    it('leaves every other key alone, and a key with Ctrl, Alt or Meta', () => {
        const { tabs } = mount();
        expect(key(tabs[0]!, 'a').defaultPrevented).toBe(false);
        expect(key(tabs[0]!, 'ArrowRight', { altKey: true }).defaultPrevented).toBe(false);
        expect(selectedOf(tabs)).toBe(0);
    });

    it('manual activation: the arrows move the focus only, and the click that Enter or Space makes selects', () => {
        const { tabs, panels } = mount(['A', 'B', 'C'], { activation: 'manual' });
        tabs[0]!.focus();
        key(tabs[0]!, 'ArrowRight');
        expect(document.activeElement).toBe(tabs[1]);
        expect(selectedOf(tabs), 'the selection waits').toBe(0);
        expect(tabs.map((t) => t.tabIndex), 'and so does the tab stop').toEqual([0, -1, -1]);
        expect(key(tabs[1]!, 'Enter').defaultPrevented, 'a real button turns Enter into its click').toBe(false);
        tabs[1]!.click();
        expect(selectedOf(tabs)).toBe(1);
        expect(shown(panels)).toEqual(['p1']);
    });

    it('manual activation on a tab that is not a button takes Enter and Space itself', () => {
        document.body.innerHTML = `
            <div role="tablist" id="list">
                <span role="tab" id="t0" aria-controls="p0" aria-selected="true">A</span>
                <span role="tab" id="t1" aria-controls="p1">B</span>
            </div>
            <div role="tabpanel" id="p0"></div><div role="tabpanel" id="p1"></div>`;
        const list = document.getElementById('list')!;
        releases.push(enhanceTabs(list, { activation: 'manual' }));
        const b = document.getElementById('t1')!;
        expect(key(b, ' ').defaultPrevented).toBe(true);
        expect(b.getAttribute('aria-selected')).toBe('true');
    });
});

describe('enhanceTabs — the click and the event', () => {
    it('a click selects; a click on a tab that cannot be used does not', () => {
        const { tabs } = mount();
        tabs[2]!.click();
        expect(selectedOf(tabs)).toBe(2);
        tabs[1]!.setAttribute('aria-disabled', 'true');
        tabs[1]!.click();
        expect(selectedOf(tabs)).toBe(2);
    });

    it('a tab selected from code is a click() on it, and it does not take the focus', () => {
        const { tabs } = mount();
        document.getElementById('list')!.insertAdjacentHTML('afterend', '<input id="field">');
        const field = document.getElementById('field')!;
        field.focus();
        tabs[1]!.click();
        expect(selectedOf(tabs)).toBe(1);
        expect(document.activeElement).toBe(field);
    });

    it('fires aparte-tab-change before the panel shows, with the tab, its panel and the one it leaves', () => {
        const { list, tabs, panels } = mount();
        const seen: Array<AparteTabChangeDetail & { panelHiddenThen: boolean }> = [];
        list.addEventListener('aparte-tab-change', (e) => seen.push({ ...e.detail, panelHiddenThen: e.detail.panel?.hidden ?? false }));
        key(tabs[0]!, 'ArrowRight');
        expect(seen).toHaveLength(1);
        expect(seen[0]!.tab).toBe(tabs[1]);
        expect(seen[0]!.panel).toBe(panels[1]);
        expect(seen[0]!.previous).toBe(tabs[0]);
        expect(seen[0]!.panelHiddenThen, 'a listener can measure or fill the panel before it shows').toBe(true);

        tabs[1]!.click();
        expect(seen, 'the tab already selected changes nothing').toHaveLength(1);
    });

    it('preventDefault() on aparte-tab-change keeps the current tab, focus and all', () => {
        const { list, tabs, panels } = mount();
        list.addEventListener('aparte-tab-change', (e) => e.preventDefault());
        tabs[0]!.focus();
        key(tabs[0]!, 'ArrowRight');
        expect(selectedOf(tabs)).toBe(0);
        expect(document.activeElement).toBe(tabs[0]);
        tabs[2]!.click();
        expect(selectedOf(tabs)).toBe(0);
        expect(shown(panels)).toEqual(['p0']);
    });

    it('bubbles out of a shadow root, like core\'s other events', () => {
        const host = document.createElement('div');
        document.body.append(host);
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = markup(['A', 'B']);
        releases.push(enhanceTabs(root.querySelector<HTMLElement>('[role="tablist"]')!));
        const heard = vi.fn();
        document.addEventListener('aparte-tab-change', heard);
        root.querySelector<HTMLElement>('#t1')!.click();
        document.removeEventListener('aparte-tab-change', heard);
        expect(heard).toHaveBeenCalledTimes(1);
        expect(root.querySelector<HTMLElement>('#p1')!.hidden).toBe(false);
    });

    it('does not take the tabs of a tablist nested inside it', () => {
        document.body.innerHTML = `
            <div role="tablist" id="outer">
                <button type="button" role="tab" id="o0" aria-selected="true">Outer A</button>
                <button type="button" role="tab" id="o1">Outer B</button>
                <div role="tablist" id="inner"><button type="button" role="tab" id="i0">Inner</button></div>
            </div>`;
        releases.push(enhanceTabs(document.getElementById('outer')!));
        key(document.getElementById('o1')!, 'ArrowRight');
        expect(document.getElementById('o0')!.getAttribute('aria-selected')).toBe('true');
        expect(document.getElementById('i0')!.hasAttribute('aria-selected')).toBe(false);
    });
});

describe('enhanceTabs — release', () => {
    it('takes back its listeners and leaves the state the reader chose', () => {
        document.body.innerHTML = markup(['A', 'B', 'C']);
        const list = document.getElementById('list')!;
        const added = vi.spyOn(list, 'addEventListener');
        const removed = vi.spyOn(list, 'removeEventListener');
        const release = enhanceTabs(list);
        const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
        tabs[1]!.click();
        release();
        expect(removed.mock.calls.map((c) => c[0]).sort()).toEqual(added.mock.calls.map((c) => c[0]).sort());
        expect(selectedOf(tabs), 'the selection stays where it was left').toBe(1);
        tabs[2]!.click();
        key(tabs[1]!, 'ArrowRight');
        expect(selectedOf(tabs), 'and nothing moves it any more').toBe(1);
    });
});
