// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AparteConfig, aparteGlobalConfig, type AparteComposer, type AparteComposerInput } from '@aparte/core';
import './aparte-triggers.js';
import { AparteTriggers } from './aparte-triggers.js';
import { detectTrigger } from './detect.js';
import { matchRows, scoreItem } from './match.js';
import { collectCommands, commandItems } from './collect.js';
import { setupCommands } from './commands.js';
import type { AparteCollectCommandsDetail, AparteCommand, AparteCommandScope, AparteTrigger, AparteTriggerItem } from './types.js';

const SLASH: AparteTrigger = { char: '/', at: 'message' };
const AT: AparteTrigger = { char: '@', at: 'word' };

describe('detectTrigger', () => {
    it('finds the search before the caret', () => {
        expect(detectTrigger('hi @pa', 6, [AT])).toMatchObject({ start: 3, end: 6, query: 'pa' });
    });

    it('reads only what is before the caret', () => {
        expect(detectTrigger('@pa rest', 2, [AT])).toMatchObject({ query: 'p' });
    });

    it('does not open inside an email or a web address', () => {
        expect(detectTrigger('paul@example', 12, [AT])).toBeNull();
        expect(detectTrigger('see https://x', 13, [{ char: '/', at: 'word' }])).toBeNull();
    });

    it('opens after an opening bracket', () => {
        expect(detectTrigger('(@pa', 4, [AT])).toMatchObject({ start: 1 });
    });

    it('holds a message trigger to the start of the draft', () => {
        expect(detectTrigger('/com', 4, [SLASH])).toMatchObject({ query: 'com' });
        expect(detectTrigger('  /com', 6, [SLASH])).toMatchObject({ start: 2 });
        expect(detectTrigger('go /com', 7, [SLASH])).toBeNull();
    });

    it('ends at a space, unless the trigger allows them', () => {
        expect(detectTrigger('@paul r', 7, [AT])).toBeNull();
        expect(detectTrigger('@paul r', 7, [{ ...AT, allowSpaces: true }])).toMatchObject({ query: 'paul r' });
    });

    it('never ends a search with spaces at a line break, or starting on one', () => {
        expect(detectTrigger('@pa\nul', 6, [{ ...AT, allowSpaces: true }])).toBeNull();
        expect(detectTrigger('@ x', 3, [{ ...AT, allowSpaces: true }])).toBeNull();
    });

    it('does not read across a token', () => {
        expect(detectTrigger('@￼x', 3, [AT])).toBeNull();
        expect(detectTrigger('￼ @x', 4, [AT])).toMatchObject({ query: 'x' });
    });

    it('takes the nearest of several triggers', () => {
        expect(detectTrigger('#a @b', 5, [AT, { char: '#' }])).toMatchObject({ trigger: { char: '@' } });
    });

    it('takes a trigger of several characters', () => {
        expect(detectTrigger('::sm', 4, [{ char: '::' }])).toMatchObject({ start: 0, query: 'sm' });
    });

    it('gives up on a very long run', () => {
        expect(detectTrigger(`@${'a'.repeat(70)}`, 71, [AT])).toBeNull();
    });
});

describe('matching', () => {
    const item = (label: string, more: Partial<AparteTriggerItem> = {}): AparteTriggerItem => ({ id: label, label, ...more });

    it('puts a prefix before a substring', () => {
        const rows = matchRows([item('recompact'), item('compact')], 'com', SLASH);
        expect(rows.map((r) => r.item.id)).toEqual(['compact', 'recompact']);
    });

    it('ignores case and accents', () => {
        expect(scoreItem(item('Élise'), 'eli')).toBe(3);
    });

    it('skips the marks a label starts with', () => {
        expect(scoreItem(item('/compact'), 'com')).toBe(3);
    });

    it('finds by a keyword and a description', () => {
        expect(scoreItem(item('x', { keywords: ['alpha'] }), 'alp')).toBe(3);
        expect(scoreItem(item('x', { description: 'the beta one' }), 'beta')).toBe(1);
        expect(scoreItem(item('x'), 'zzz')).toBe(0);
    });

    it('flattens submenus for a search and says where a row comes from', () => {
        const rows = matchRows([item('A', { children: [item('Open')] }), item('B', { children: [item('Open')] })], 'open', SLASH);
        expect(rows.map((r) => r.path)).toEqual([['A'], ['B']]);
    });

    it('lists only the top level with no search', () => {
        expect(matchRows([item('A', { children: [item('Open')] })], '', SLASH)).toHaveLength(1);
    });

    it('takes a matcher of the app', () => {
        const match = (i: AparteTriggerItem) => (i.id === 'b' ? 5 : false);
        expect(matchRows([item('a'), item('b')], 'q', { ...SLASH, match }).map((r) => r.item.id)).toEqual(['b']);
    });

    it('stops at maxItems', () => {
        expect(matchRows([item('a'), item('b')], '', { ...SLASH, maxItems: 1 })).toHaveLength(1);
    });
});

describe('collecting commands', () => {
    const config = new AparteConfig();
    const scope = (cfg: AparteConfig = config): AparteCommandScope => ({
        config: cfg, composer: document.createElement('aparte-composer') as AparteComposer, chat: null, targetId: undefined,
    });
    const listeners: EventListener[] = [];
    const answer = (cfg: AparteConfig, ...commands: AparteCommand[]) => {
        const listener: EventListener = (e) => {
            const { detail } = e as CustomEvent<AparteCollectCommandsDetail>;
            if (detail.config === cfg) commands.forEach((c) => detail.add(c));
        };
        listeners.push(listener);
        window.addEventListener('aparte-collect-commands', listener);
    };
    const host = () => document.body.appendChild(document.createElement('div'));

    afterEach(() => {
        listeners.splice(0).forEach((l) => window.removeEventListener('aparte-collect-commands', l));
        document.body.innerHTML = '';
    });

    it('is empty with nobody answering, and throws nothing', () => {
        expect(collectCommands(host(), scope())).toEqual([]);
    });

    it('hears a plugin that imports nothing from here', () => {
        answer(config, { id: 'compact' });
        expect(collectCommands(host(), scope()).map((c) => c.id)).toEqual(['compact']);
    });

    it('ignores the commands of another chat config', () => {
        answer(new AparteConfig(), { id: 'other' });
        expect(collectCommands(host(), scope())).toEqual([]);
    });

    it('keeps the last answer for an id', () => {
        answer(config, { id: 'x', label: 'first' });
        answer(config, { id: 'x', label: 'second' });
        expect(collectCommands(host(), scope()).map((c) => c.label)).toEqual(['second']);
    });

    const items = (commands: AparteCommand[], choices = {}) => commandItems(commands, '/', scope(), choices);

    it('shows the trigger and the name when there is no label', () => {
        expect(items([{ id: 'compact' }])[0]!.label).toBe('/compact');
    });

    it('sorts by order, then as they came', () => {
        expect(items([{ id: 'b' }, { id: 'c', order: 1 }, { id: 'a' }]).map((i) => i.id)).toEqual(['c', 'b', 'a']);
    });

    it('leaves out what is hidden, and what cannot act here', () => {
        expect(items([{ id: 'a', hidden: true }, { id: 'b', enabled: () => false }, { id: 'c', enabled: () => true }]).map((i) => i.id)).toEqual(['c']);
    });

    it('lets the app exclude a command', () => {
        expect(items([{ id: 'a' }, { id: 'b' }], { exclude: ['a'] }).map((i) => i.id)).toEqual(['b']);
    });

    it('lets the app override what a plugin said, even its gate', () => {
        const [row] = items([{ id: 'a', enabled: () => false }], { override: { a: { label: 'Again', enabled: () => true } } });
        expect(row!.label).toBe('Again');
    });
});

describe('<aparte-triggers>', () => {
    function mount(triggers?: readonly AparteTrigger[]) {
        const composer = document.createElement('aparte-composer') as AparteComposer;
        composer.innerHTML = '<aparte-triggers></aparte-triggers><aparte-composer-input></aparte-composer-input>';
        document.body.appendChild(composer);
        const element = composer.querySelector('aparte-triggers') as AparteTriggers;
        if (triggers) element.triggers = triggers;
        const input = composer.querySelector('aparte-composer-input') as AparteComposerInput;
        const editor = input.querySelector('.aparte-ci-editor') as HTMLElement;
        const type = (text: string) => {
            editor.textContent = text;
            const range = document.createRange();
            range.setStart(editor.firstChild ?? editor, text.length);
            range.collapse(true);
            const sel = document.getSelection()!;
            sel.removeAllRanges();
            sel.addRange(range);
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const key = (name: string, init: KeyboardEventInit = {}) => {
            const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
            editor.dispatchEvent(event);
            return event;
        };
        return { composer, element, input, editor, type, key };
    }
    const options = (el: HTMLElement) => [...el.querySelectorAll('[role="option"]')];
    const labels = (el: HTMLElement) => options(el).map((o) => o.querySelector('.aparte-menu__body')?.firstChild?.textContent ?? o.textContent);
    const active = (el: HTMLElement) => el.querySelector('[aria-selected="true"]')?.querySelector('.aparte-menu__body')?.firstChild?.textContent;
    const list = (...names: string[]): AparteTriggerItem[] => names.map((label) => ({ id: label, label }));
    const flush = async () => {
        for (let i = 0; i < 4; i++) await Promise.resolve();
    };
    const disposers: Array<() => void> = [];

    afterEach(() => {
        disposers.splice(0).forEach((d) => d());
        document.body.innerHTML = '';
        vi.useRealTimers();
    });

    it('draws nothing until a trigger is typed', () => {
        const { element, type } = mount([{ ...AT, items: list('Paul') }]);
        type('hello');
        expect(element.isOpen).toBe(false);
        expect(element.querySelector('[role="listbox"]')).toBeNull();
    });

    it('opens on a trigger and narrows as you type', () => {
        const { element, type } = mount([{ ...AT, items: list('Paul', 'Anna') }]);
        type('@');
        expect(labels(element)).toEqual(['Paul', 'Anna']);
        type('@an');
        expect(labels(element)).toEqual(['Anna']);
    });

    it('closes on a list with nothing to offer', () => {
        const { element, type } = mount([{ ...AT, items: list('Paul') }]);
        type('@zz');
        expect(element.isOpen).toBe(false);
    });

    it('moves with the arrows, wraps, and skips what is disabled', () => {
        const items: AparteTriggerItem[] = [{ id: 'a', label: 'a' }, { id: 'b', label: 'b', disabled: true }, { id: 'c', label: 'c' }];
        const { element, type, key } = mount([{ ...AT, items }]);
        type('@');
        expect(active(element)).toBe('a');
        key('ArrowDown');
        expect(active(element)).toBe('c');
        key('ArrowDown');
        expect(active(element)).toBe('a');
        key('ArrowUp');
        expect(active(element)).toBe('c');
    });

    it('Enter chooses and does not send; Enter sends once closed', () => {
        const { composer, element, type, key, editor } = mount([{ ...AT, items: list('Paul') }]);
        let sends = 0;
        composer.addEventListener('aparte-send', () => { sends += 1; });
        type('@');
        const enter = key('Enter');
        expect(enter.defaultPrevented).toBe(true);
        expect(sends).toBe(0);
        expect(element.isOpen).toBe(false);
        expect(editor.querySelector('.aparte-inline-token')!.textContent).toBe('Paul');
        key('Enter');
        expect(sends).toBe(1);
    });

    it('never takes Enter during a composition', () => {
        const { element, type, key } = mount([{ ...AT, items: list('Paul') }]);
        type('@');
        const enter = key('Enter', { isComposing: true });
        expect(enter.defaultPrevented).toBe(false);
        expect(element.isOpen).toBe(true);
    });

    it('does not reopen after Escape until the caret leaves the trigger', () => {
        const { element, type, key } = mount([{ ...AT, items: list('Paul') }]);
        type('@p');
        key('Escape');
        expect(element.isOpen).toBe(false);
        type('@pa');
        expect(element.isOpen).toBe(false);
        type('');
        type('@');
        expect(element.isOpen).toBe(true);
    });

    it('inserts what the row says, in place of the trigger', () => {
        const items: AparteTriggerItem[] = [{ id: 'hi', label: 'Hi', insert: 'Hello there' }];
        const { input, type, key } = mount([{ ...AT, items }]);
        type('@h');
        key('Enter');
        expect(input.getValue()).toBe('Hello there');
    });

    it('puts a default token with the kind of the trigger and the data of the row', () => {
        const items: AparteTriggerItem[] = [{ id: 'p', label: 'Paul', data: { id: 7 } }];
        const { input, type, key } = mount([{ ...AT, kind: 'mention', items }]);
        type('@');
        key('Tab');
        expect(input.getTokens()).toMatchObject([{ label: 'Paul', text: '@Paul', kind: 'mention', data: { id: 7 } }]);
    });

    it('runs a command, removing what was typed', async () => {
        const run = vi.fn();
        const { input, type, key } = mount([{ ...SLASH, items: [{ id: 'go', label: 'go', run }] }]);
        type('/g');
        key('Enter');
        await flush();
        expect(input.getValue()).toBe('');
        expect(run).toHaveBeenCalledOnce();
        expect(run.mock.calls[0]![0]).toMatchObject({ query: 'g', item: { id: 'go' } });
    });

    it('lets a listener take the choice over', async () => {
        const run = vi.fn();
        const { element, input, type, key } = mount([{ ...SLASH, items: [{ id: 'go', label: 'go', run }] }]);
        element.addEventListener('aparte-trigger-select', (e) => e.preventDefault());
        type('/g');
        key('Enter');
        await flush();
        expect(run).not.toHaveBeenCalled();
        expect(input.getValue()).toBe('/g');
    });

    it('says a failed command to the console and goes on', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { type, key } = mount([{ ...SLASH, items: [{ id: 'go', label: 'go', run: () => { throw new Error('no'); } }] }]);
        type('/');
        key('Enter');
        await flush();
        await flush();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('keeps the focus in the field on a press', () => {
        const { element, type } = mount([{ ...AT, items: list('Paul') }]);
        type('@');
        const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        options(element)[0]!.dispatchEvent(press);
        expect(press.defaultPrevented).toBe(true);
    });

    it('chooses on a click', () => {
        const { element, input, type } = mount([{ ...AT, items: list('Paul') }]);
        type('@');
        (options(element)[0] as HTMLElement).click();
        expect(input.getTokens()).toHaveLength(1);
    });

    it('says what is open and which row is active on the field', () => {
        const { element, editor, type, key } = mount([{ ...AT, items: list('a', 'b') }]);
        type('@');
        expect(editor.getAttribute('role')).toBe('combobox');
        expect(editor.getAttribute('aria-activedescendant')).toBe(options(element)[0]!.id);
        expect(editor.getAttribute('aria-controls')).toBe(element.querySelector('[role="listbox"]')!.id);
        key('ArrowDown');
        expect(editor.getAttribute('aria-activedescendant')).toBe(options(element)[1]!.id);
        key('Escape');
        expect(editor.getAttribute('role')).toBe('textbox');
        expect(editor.hasAttribute('aria-activedescendant')).toBe(false);
    });

    it('groups rows while nothing is searched', () => {
        const items: AparteTriggerItem[] = [{ id: 'a', label: 'a', group: 'X' }, { id: 'b', label: 'b', group: 'Y' }, { id: 'c', label: 'c', group: 'X' }];
        const { element, type, key } = mount([{ ...AT, items }]);
        type('@');
        expect([...element.querySelectorAll('.aparte-menu__label')].map((l) => l.textContent)).toEqual(['X', 'Y']);
        expect(labels(element)).toEqual(['a', 'c', 'b']);
        key('ArrowDown');
        expect(active(element)).toBe('c');
    });

    it('draws what a row renders itself, in its own row', () => {
        const render = () => { const el = document.createElement('b'); el.textContent = 'mine'; return el; };
        const { element, type } = mount([{ ...AT, items: [{ id: 'a', label: 'a', render }] }]);
        type('@');
        expect(options(element)[0]!.querySelector('b')!.textContent).toBe('mine');
    });

    it('shows a label as text, never as markup', () => {
        const { element, type } = mount([{ ...AT, items: list('<img src=x onerror=1>') }]);
        type('@');
        expect(element.querySelector('img')).toBeNull();
    });

    describe('a list asked on demand', () => {
        it('is asked after the pause, once for several keystrokes', async () => {
            vi.useFakeTimers();
            const source = vi.fn((q: string) => list(`result ${q}`));
            const { element, type } = mount([{ ...AT, items: source }]);
            type('@a');
            type('@ab');
            expect(source).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(160);
            expect(source).toHaveBeenCalledOnce();
            expect(source.mock.calls[0]![0]).toBe('ab');
            expect(labels(element)).toEqual(['result ab']);
        });

        it('says it is loading', async () => {
            let release: (items: AparteTriggerItem[]) => void = () => {};
            const { element, type } = mount([{ ...AT, debounce: 0, items: () => new Promise((r) => { release = r; }) }]);
            type('@');
            await flush();
            expect(element.querySelector('.aparte-menu__status')).not.toBeNull();
            release(list('a'));
            await flush();
            expect(element.querySelector('.aparte-menu__status')).toBeNull();
            expect(labels(element)).toEqual(['a']);
        });

        it('drops a reply that a newer search has overtaken', async () => {
            const replies: Array<(items: AparteTriggerItem[]) => void> = [];
            const signals: AbortSignal[] = [];
            const source = (_q: string, { signal }: { signal: AbortSignal }) => {
                signals.push(signal);
                return new Promise<AparteTriggerItem[]>((r) => replies.push(r));
            };
            const { element, type } = mount([{ ...AT, debounce: 0, items: source }]);
            type('@a');
            await new Promise((r) => setTimeout(r, 0));
            type('@ab');
            await new Promise((r) => setTimeout(r, 0));
            expect(signals[0]!.aborted).toBe(true);
            replies[1]!(list('new'));
            await flush();
            replies[0]!(list('old'));
            await flush();
            expect(labels(element)).toEqual(['new']);
        });

        it('says when it found nothing', async () => {
            const { element, type } = mount([{ ...AT, debounce: 0, items: async () => [] }]);
            type('@');
            await flush();
            expect(element.querySelector('.aparte-menu__status')!.textContent).toBe('No results');
        });

        it('offers to try again after a failure, and does', async () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            let fails = true;
            const source = async () => {
                if (fails) throw new Error('down');
                return list('back');
            };
            const { element, type, key } = mount([{ ...AT, debounce: 0, items: source }]);
            type('@');
            await flush();
            expect(element.querySelector('.aparte-menu__status')!.textContent).toBe('This list could not be loaded');
            expect(labels(element)).toEqual(['Try again']);
            fails = false;
            key('Enter');
            await flush();
            expect(labels(element)).toEqual(['back']);
            spy.mockRestore();
        });
    });

    describe('a submenu', () => {
        const tree: AparteTriggerItem[] = [
            { id: 'p', label: 'Parent', children: [{ id: 'a', label: 'Child A', insert: 'A!' }, { id: 'b', label: 'Child B' }] },
            { id: 'q', label: 'Other' },
        ];
        const panels = (el: HTMLElement) => el.querySelectorAll('[role="listbox"]').length;

        it('opens on the arrow and on Enter, and shows that it can', () => {
            const { element, type, key } = mount([{ ...AT, items: tree }]);
            type('@');
            expect(options(element)[0]!.getAttribute('aria-haspopup')).toBe('listbox');
            expect(options(element)[0]!.getAttribute('aria-expanded')).toBe('false');
            expect(element.querySelector('.aparte-menu__chevron')).not.toBeNull();
            key('ArrowRight');
            expect(panels(element)).toBe(2);
            expect(options(element)[0]!.getAttribute('aria-expanded')).toBe('true');
            key('ArrowLeft');
            expect(panels(element)).toBe(1);
            key('Enter');
            expect(panels(element)).toBe(2);
        });

        it('chooses in the submenu', () => {
            const { input, type, key } = mount([{ ...AT, items: tree }]);
            type('@');
            key('ArrowRight');
            key('Enter');
            expect(input.getValue()).toBe('A!');
        });

        it('leaves the caret alone when there is nowhere to go', () => {
            const { type, key } = mount([{ ...AT, items: tree }]);
            type('@');
            expect(key('ArrowLeft').defaultPrevented).toBe(false);
        });

        it('climbs back with Backspace on an empty search', () => {
            const { element, type, key } = mount([{ ...AT, items: tree }]);
            type('@');
            key('ArrowRight');
            expect(key('Backspace').defaultPrevented).toBe(true);
            expect(panels(element)).toBe(1);
        });

        it('reverses the arrows in right to left', () => {
            const { element, type, key } = mount([{ ...AT, items: tree }]);
            element.style.direction = 'rtl';
            type('@');
            key('ArrowLeft');
            expect(panels(element)).toBe(2);
            key('ArrowRight');
            expect(panels(element)).toBe(1);
        });

        it('asks a function once it opens', async () => {
            const children = vi.fn(async () => list('Deep'));
            const { element, type, key } = mount([{ ...AT, items: [{ id: 'p', label: 'P', children }] }]);
            type('@');
            expect(children).not.toHaveBeenCalled();
            key('ArrowRight');
            await flush();
            expect(children).toHaveBeenCalledOnce();
            expect(labels(element)).toContain('Deep');
        });

        it('goes to any depth', () => {
            const deep: AparteTriggerItem[] = [{ id: '1', label: '1', children: [{ id: '2', label: '2', children: [{ id: '3', label: '3', insert: 'three' }] }] }];
            const { input, type, key } = mount([{ ...AT, items: deep }]);
            type('@');
            key('ArrowRight');
            key('ArrowRight');
            key('Enter');
            expect(input.getValue()).toBe('three');
        });

        it('takes the place of its parent on a phone, with a way back', () => {
            const original = window.matchMedia;
            window.matchMedia = ((q: string) => ({ matches: q.includes('max-width') })) as never;
            try {
                const { element, type, key } = mount([{ ...AT, items: tree }]);
                type('@');
                key('Enter');
                const panel = element.querySelectorAll<HTMLElement>('[role="listbox"]');
                expect(panel[0]!.hidden).toBe(true);
                expect(active(panel[1]!)).toBe('Child A');
                key('ArrowUp');
                expect(active(panel[1]!)).toBe('Back');
                key('Enter');
                expect(element.querySelectorAll('[role="listbox"]')).toHaveLength(1);
            } finally {
                window.matchMedia = original;
            }
        });
    });

    describe('with commands from plugins', () => {
        const commandsMount = (more: Partial<AparteTrigger> = {}) => mount([{ ...SLASH, commands: true, ...more }]);

        it('draws nothing and fails on nothing when no plugin answers', () => {
            const { element, type } = commandsMount();
            type('/');
            expect(element.isOpen).toBe(false);
        });

        it('lists what the built-ins answer, and only what can act', () => {
            disposers.push(setupCommands());
            const { element, type } = commandsMount();
            type('/');
            expect(labels(element)).toEqual(['/new']);
        });

        it('stops answering once disposed', () => {
            setupCommands()();
            const { element, type } = commandsMount();
            type('/');
            expect(element.isOpen).toBe(false);
        });

        it('leaves out what an app excludes', () => {
            disposers.push(setupCommands());
            const { element, type } = commandsMount({ commands: { exclude: ['new'] } });
            type('/');
            expect(element.isOpen).toBe(false);
        });

        it('sets a list of the app before the commands, and an id it reuses replaces the command', () => {
            disposers.push(setupCommands());
            const { element, type } = commandsMount({ items: [{ id: 'new', label: 'Mine' }, { id: 'x', label: 'Extra' }] });
            type('/');
            expect(labels(element)).toEqual(['Mine', 'Extra']);
        });

        it('collects for its own config', () => {
            const other = new AparteConfig();
            disposers.push(setupCommands({}, other));
            const { element, type } = commandsMount();
            type('/');
            expect(element.isOpen).toBe(false);
            expect(aparteGlobalConfig).not.toBe(other);
        });
    });

    it('warns when placed outside a composer', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        document.body.appendChild(document.createElement('aparte-triggers'));
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('stops listening once removed', () => {
        const { element, composer, type } = mount([{ ...AT, items: list('Paul') }]);
        element.remove();
        type('@');
        expect(composer.querySelector('[role="listbox"]')).toBeNull();
    });
});
