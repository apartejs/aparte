/**
 * A standalone view placed inside a message announces a link click once.
 *
 * An app's own renderer can put `<aparte-subagent-view>` inside a bubble. The bubble announces
 * every click on a link in its body, so the view must stay quiet there: a handler that cancels
 * the first announcement would otherwise hear a second. Beside the chat the view announces.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents } from '../index.js';
import { as, chat, frame } from './harness.js';

const links = (md: string): string => md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

async function working(): Promise<void> {
    aparteGlobalConfig.setMarkdownProvider(links);
    stop = setupSubagents({});
    chat().run(
        { type: 'run-start' },
        { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'a1', name: 'Researcher', description: 'Read the parser', toolCallId: 'c1' },
        ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'See [the parser](src/parser.ts).' }),
        { type: 'agent-end', agentId: 'a1', status: 'done' },
    );
    await frame();
}

function standalone(into: Element): HTMLElement {
    const view = document.createElement('aparte-subagent-view');
    view.setAttribute('for', 'chat-1');
    view.setAttribute('message-id', 'a1');
    view.setAttribute('agent-id', 'a1');
    into.append(view);
    return view;
}

function clicks(view: HTMLElement): number {
    let heard = 0;
    const listener = (event: Event): void => { heard++; event.preventDefault(); };
    document.addEventListener('aparte-link-click', listener);
    view.querySelector('a[href]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    document.removeEventListener('aparte-link-click', listener);
    return heard;
}

describe('a standalone sub-agent view and a link click', () => {
    it('inside a message: announced once, by the bubble', async () => {
        await working();
        const bubble = document.querySelector('aparte-chat-bubble')!;
        const view = standalone(bubble.querySelector('.aparte-message-content') ?? bubble);
        await frame();
        expect(clicks(view)).toBe(1);
    });

    it('beside the chat: announced once, by the view', async () => {
        await working();
        const pane = document.createElement('section');
        document.body.append(pane);
        const view = standalone(pane);
        await frame();
        expect(clicks(view)).toBe(1);
    });
});
