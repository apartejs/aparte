/**
 * A sub-agent's link is a link of the conversation.
 *
 * A view placed beside the chat — a pane, a canvas — is outside every message, so no message
 * hears a click in it, and an app that routes the links a reply holds (`aparte-link-click`)
 * could not route these: a same-site one replaced the page. The view announces it on its chat,
 * cancelable, as the message announces its own. Under the line, inside the reply, the message
 * announces it, once. Either way the link opens where the chat's config says.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, type AparteLinkClickEventDetail, type AparteMessage } from '@aparte/core';
import { setupSubagents, type AparteSubagentView, type SubagentsOptions } from '../index.js';
import { as, chat, frame, type Chat } from './harness.js';

/** A stand-in for marked: `[text](href)` as a bare anchor. */
const links = (md: string): string => md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

let stop: (() => void) | undefined;
afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

async function working(options: SubagentsOptions = {}): Promise<Chat> {
    aparteGlobalConfig.setMarkdownProvider(links);
    stop = setupSubagents(options);
    const c = chat();
    c.run(
        { type: 'run-start' },
        { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'a1', name: 'Researcher', description: 'Read the parser', toolCallId: 'c1' },
        ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'See [the parser](src/parser.ts).' }),
        { type: 'agent-end', agentId: 'a1', status: 'done' },
    );
    await frame();
    return c;
}

function beside(): AparteSubagentView {
    const view = document.createElement('aparte-subagent-view');
    view.setAttribute('for', 'chat-1');
    view.setAttribute('message-id', 'a1');
    view.setAttribute('agent-id', 'a1');
    const pane = document.createElement('section');
    pane.append(view);
    document.body.append(pane);
    return view;
}

const click = (anchor: Element): MouseEvent => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    return event;
};

describe("a sub-agent's link", () => {
    it('beside the chat: opens in a new tab, and is announced on the chat, cancelable', async () => {
        const c = await working();
        const view = beside();
        const link = view.querySelector<HTMLAnchorElement>('a[href="src/parser.ts"]')!;
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        const seen: AparteLinkClickEventDetail[] = [];
        c.host.addEventListener('aparte-link-click', (event) => {
            seen.push((event as CustomEvent<AparteLinkClickEventDetail>).detail);
            event.preventDefault();
        });

        const event = click(link);
        expect(seen).toEqual([{ href: 'src/parser.ts', anchor: link, messageId: 'a1' }]);
        expect(event.defaultPrevented, 'the cancelled announcement cancels the click').toBe(true);
    });

    it('beside the chat, with nobody cancelling: followed', async () => {
        const c = await working();
        const view = beside();
        let heard = 0;
        c.host.addEventListener('aparte-link-click', () => { heard++; });
        // Followed, the link would open its new tab: the document stops it, once it has seen
        // that nothing before it did.
        let prevented: boolean | undefined;
        document.addEventListener('click', (event) => { prevented = event.defaultPrevented; event.preventDefault(); }, { once: true });
        click(view.querySelector('a[href="src/parser.ts"]')!);
        expect(heard).toBe(1);
        expect(prevented).toBe(false);
    });

    it('under the line, inside the reply: announced once, by the message', async () => {
        const c = await working({ details: 'transcript' });
        const view = c.row('tool-c1')!.querySelector<HTMLElement>('aparte-subagent-view')!;
        const link = view.querySelector<HTMLAnchorElement>('a[href="src/parser.ts"]')!;
        const seen: AparteLinkClickEventDetail[] = [];
        c.host.addEventListener('aparte-link-click', (event) => {
            seen.push((event as CustomEvent<AparteLinkClickEventDetail>).detail);
            event.preventDefault();
        });
        const event = click(link);
        expect(seen).toHaveLength(1);
        expect(seen[0]!.anchor).toBe(link);
        expect(event.defaultPrevented).toBe(true);
    });

    /** A saved reply holding a sub-agent that wrote a link, for a chat given as an object. */
    const saved = {
        id: 'm1', role: 'assistant', content: '', timestamp: 1, status: 'completed',
        segments: [{
            id: 'subagent-x', type: 'subagent',
            subagent: { id: 'x', name: 'Planner', description: 'Plan it', status: 'done', segments: [{ id: 't1', type: 'text', content: 'See [the plan](plan.md).' }] },
        }],
    } as AparteMessage;

    function given(source: object): { view: AparteSubagentView; link: HTMLAnchorElement } {
        aparteGlobalConfig.setMarkdownProvider(links);
        const view = document.createElement('aparte-subagent-view');
        view.setAttribute('message-id', 'm1');
        view.setAttribute('agent-id', 'x');
        document.body.append(view);
        view.chat = source;
        return { view, link: view.querySelector<HTMLAnchorElement>('a[href="plan.md"]')! };
    }

    it("beside a chat given as an app's handle: announced on the element the handle names", () => {
        const root = document.createElement('div');
        document.body.append(root);
        const { link } = given({ getMessages: () => [saved], getElement: () => root });
        const seen: AparteLinkClickEventDetail[] = [];
        root.addEventListener('aparte-link-click', (event) => {
            seen.push((event as CustomEvent<AparteLinkClickEventDetail>).detail);
            event.preventDefault();
        });
        const event = click(link);
        expect(seen).toEqual([{ href: 'plan.md', anchor: link, messageId: 'm1' }]);
        expect(event.defaultPrevented).toBe(true);
    });

    it('beside a chat that is no element: announced on the view itself', () => {
        const { view, link } = given({ getMessages: () => [saved] });
        let target: EventTarget | null = null;
        document.addEventListener('aparte-link-click', (event) => { target = event.target; event.preventDefault(); }, { once: true });
        const event = click(link);
        expect(target).toBe(view);
        expect(event.defaultPrevented).toBe(true);
    });
});
