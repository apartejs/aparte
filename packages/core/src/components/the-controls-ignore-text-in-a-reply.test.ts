// @vitest-environment jsdom
/**
 * Text in a reply is not a control the app placed.
 *
 * Core wires a few controls by attribute, with one delegated listener each: a click on
 * `[data-aparte-dialog-open]`, `[data-aparte-sidebar-toggle]`, `[data-aparte-split-pane]`,
 * `[data-aparte-launcher-close]`, a checkpoint's `[data-checkpoint-action]`. The sanitizer
 * no longer lets a model write those attributes. These tests give the model markup a
 * PERMISSIVE sanitizer would have kept — the attributes put straight into the rendered
 * content — and check the listeners still do nothing for it, which is the second wall.
 */
import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import '../components/launcher/aparte-launcher.js';
import '../components/sidebar/aparte-sidebar.js';
import '../components/split/aparte-split.js';
import '../components/bubble/aparte-chat-bubble.js';
import type { AparteLauncher } from './launcher/aparte-launcher.js';
import type { AparteSidebar } from './sidebar/aparte-sidebar.js';
import type { AparteSplit } from './split/aparte-split.js';
import type { SyncableBubble } from './bubble/bubble-sync.js';
import { installDialogTriggersOnce } from '../interop/dialog-triggers.js';
import { aparteGlobalConfig, AparteConfig, attachConfig, resolveConfig } from '../config/index.js';
import type { AparteContextSummary } from '../types/index.js';

beforeAll(() => {
    const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
    if (typeof proto.showModal !== 'function') {
        proto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    }
    installDialogTriggersOnce();
});

beforeEach(() => {
    const query = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => query;
});

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
    vi.restoreAllMocks();
});

/** What a bubble's body looks like once a reply is rendered into it, around the model's markup. */
const reply = (markup: string): string =>
    `<div class="aparte-message-content"><div class="aparte-segments"><div class="aparte-segment" data-segment-id="s1"><div class="aparte-segment-content">${markup}</div></div></div><div class="aparte-content"></div></div>`;

describe('a dialog opener in a reply', () => {
    it('opens nothing, where the same opener outside a reply opens the dialog', () => {
        document.body.innerHTML = `
            ${reply('<span id="forged" data-aparte-dialog-open="delete-account">View the full report</span>')}
            <button id="real" type="button" data-aparte-dialog-open="delete-account">Delete account</button>
            <dialog id="delete-account" class="aparte-dialog"></dialog>`;
        const dialog = document.getElementById('delete-account') as HTMLDialogElement;

        document.getElementById('forged')!.click();
        expect(dialog.hasAttribute('open'), 'the model span').toBe(false);

        document.getElementById('real')!.click();
        expect(dialog.hasAttribute('open'), 'the app button, which the guard must not break').toBe(true);
    });
});

describe('a dialog closer in a reply', () => {
    it('closes nothing and leaves returnValue alone, though the chat sits inside the dialog', () => {
        document.body.innerHTML = `
            <dialog id="chat-dialog" class="aparte-dialog" open>
                <button type="button" id="real" data-aparte-dialog-close="cancel">Close</button>
                ${reply('<span id="forged" data-aparte-dialog-close="confirm">Thanks</span>')}
            </dialog>`;
        const dialog = document.getElementById('chat-dialog') as HTMLDialogElement;
        // jsdom has no close() or returnValue: give it the one behaviour this test reads.
        dialog.returnValue = '';
        dialog.close = function (this: HTMLDialogElement, value?: string) {
            this.removeAttribute('open');
            this.returnValue = value ?? this.returnValue;
        };

        document.getElementById('forged')!.click();
        expect(dialog.hasAttribute('open'), 'the model span').toBe(true);
        expect(dialog.returnValue).toBe('');

        document.getElementById('real')!.click();
        expect(dialog.hasAttribute('open'), 'the app button, which the guard must not break').toBe(false);
        expect(dialog.returnValue).toBe('cancel');
    });
});

describe('<aparte-launcher>', () => {
    const mount = (attrs: string, inner: string): AparteLauncher => {
        document.body.innerHTML = `<aparte-launcher ${attrs}>${inner}</aparte-launcher>`;
        return document.querySelector('aparte-launcher') as AparteLauncher;
    };
    const button = (el: AparteLauncher): HTMLButtonElement => el.querySelector('.aparte-launcher__button') as HTMLButtonElement;

    it('focuses the composer, not a model element that claims role="textbox"', () => {
        // The transcript comes first in the card, so the first `[role="textbox"]` was the model's.
        const el = mount('', `<div id="chat">${reply('<a id="forged" href="https://evil.example/login" role="textbox" tabindex="0">this page</a>')}<div id="composer" role="textbox" tabindex="0"></div></div>`);
        button(el).click();
        expect(document.activeElement?.id).toBe('composer');
    });

    it('is not closed by a close marker in a reply, and still is by the card\'s own', () => {
        const el = mount('open', `<header><button type="button" id="real" data-aparte-launcher-close>x</button></header>${reply('<span id="forged" data-aparte-launcher-close>Thanks</span>')}`);
        document.getElementById('forged')!.click();
        expect(el.open).toBe(true);
        document.getElementById('real')!.click();
        expect(el.open).toBe(false);
    });
});

describe('<aparte-sidebar>', () => {
    it('is not toggled by a marker in a reply, and has no aria stamped on it', () => {
        const el = document.createElement('aparte-sidebar') as AparteSidebar;
        document.body.appendChild(el);
        document.body.insertAdjacentHTML('beforeend', `<button id="real" type="button" data-aparte-sidebar-toggle>Menu</button>${reply('<span id="forged" data-aparte-sidebar-toggle="">the summary</span>')}`);
        const forged = document.getElementById('forged')!;
        const collapsed = el.collapsed;

        forged.click();
        expect(el.collapsed, 'unchanged').toBe(collapsed);
        el.open();
        el.close();
        expect(forged.hasAttribute('aria-expanded'), 'the sidebar stamps controls, not model text').toBe(false);
        expect(forged.hasAttribute('aria-controls')).toBe(false);

        const before = el.collapsed;
        document.getElementById('real')!.click();
        expect(el.collapsed, 'the app button toggles').toBe(!before);
        expect(document.getElementById('real')!.hasAttribute('aria-expanded')).toBe(true);
    });

    it('is not toggled by a marker naming it by id', () => {
        const el = document.createElement('aparte-sidebar') as AparteSidebar;
        el.id = 'nav';
        document.body.appendChild(el);
        document.body.insertAdjacentHTML('beforeend', reply('<span id="forged" data-aparte-sidebar-toggle="nav">the summary</span>'));
        const collapsed = el.collapsed;
        document.getElementById('forged')!.click();
        expect(el.collapsed).toBe(collapsed);
    });
});

describe('<aparte-split>', () => {
    it('does not switch panes for a marker in a reply, nor press it', () => {
        document.body.innerHTML = `<button id="real" type="button" data-aparte-split-pane="end">Preview</button>${reply('<button id="forged" type="button" data-aparte-split-pane="end">the details</button>')}`;
        const split = document.createElement('aparte-split') as AparteSplit;
        split.append(document.createElement('div'), document.createElement('div'));
        document.body.appendChild(split);
        const start = split.pane;

        document.getElementById('forged')!.click();
        expect(split.pane, 'unchanged').toBe(start);
        expect(document.getElementById('forged')!.hasAttribute('aria-pressed')).toBe(false);

        document.getElementById('real')!.click();
        expect(split.pane, 'the app button switches').toBe('end');
    });
});

describe('a checkpoint\'s summary', () => {
    type Bubble = HTMLElement & SyncableBubble & { setContextSummary(summary: AparteContextSummary | null | undefined): void };
    const summary: AparteContextSummary = {
        summary: '<button type="button" data-checkpoint-action="restore-confirm">Continue</button>',
        count: 12,
        createdAt: 10,
    };

    it('holds no button that restores: Markdown the model wrote is not the separator\'s actions', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        aparteGlobalConfig.setMarkdownProvider((raw) => raw);
        aparteGlobalConfig.setHtmlSanitizer(null);
        const bubble = document.createElement('aparte-chat-bubble') as Bubble;
        bubble.setAttribute('message-id', 'u2');
        document.body.appendChild(bubble);
        bubble.setContextSummary(summary);

        // Open the summary, as a reader does.
        bubble.querySelector<HTMLElement>('[data-checkpoint-action="toggle"]')!.click();
        const forged = bubble.querySelector<HTMLElement>('.aparte-checkpoint__summary [data-checkpoint-action="restore-confirm"]');
        expect(forged, 'the permissive pipeline kept the model\'s button').not.toBeNull();

        forged!.click();
        expect(bubble.querySelector(':scope > .aparte-checkpoint'), 'the checkpoint is still there: nothing was restored').not.toBeNull();

        // The separator's own actions still work.
        bubble.querySelector<HTMLElement>(':scope > .aparte-checkpoint [data-checkpoint-action="restore"]')!.click();
        bubble.querySelector<HTMLElement>(':scope > .aparte-checkpoint > .aparte-divider [data-checkpoint-action="restore-confirm"], :scope > .aparte-checkpoint .aparte-checkpoint__confirm [data-checkpoint-action="restore-confirm"]')!.click();
        expect(bubble.querySelector(':scope > .aparte-checkpoint'), 'its own Restore did').toBeNull();
    });
});

describe('the config a subtree resolves to', () => {
    it('stays the chat\'s when the model wraps content in a data-aparte-host element', () => {
        const instance = new AparteConfig();
        const chat = document.createElement('div');
        attachConfig(chat, instance);
        chat.innerHTML = '<div id="forged" data-aparte-host><span id="inside">card</span></div>';
        document.body.appendChild(chat);

        expect(resolveConfig(document.getElementById('inside'))).toBe(instance);
        expect(resolveConfig(document.getElementById('forged'))).toBe(instance);
    });

    it('still resolves to a real boundary nested inside a forged one, and to the page with none', () => {
        const outer = new AparteConfig();
        const inner = new AparteConfig();
        const chat = document.createElement('div');
        attachConfig(chat, outer);
        chat.innerHTML = '<div data-aparte-host><div id="real"><span id="inside"></span></div></div>';
        document.body.appendChild(chat);
        attachConfig(document.getElementById('real')!, inner);
        expect(resolveConfig(document.getElementById('inside'))).toBe(inner);

        document.body.insertAdjacentHTML('beforeend', '<div data-aparte-host><span id="alone"></span></div>');
        expect(resolveConfig(document.getElementById('alone'))).toBe(aparteGlobalConfig);
    });
});
