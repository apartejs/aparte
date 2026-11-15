import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { registerAllComponents } from '@aparte/core';

/*
 * What a component hands to React for the element, read at the call: the part of the contract
 * that does not depend on the React major, and so the part this suite can pin although it runs
 * under React 19 alone.
 *
 * Two things an app on React 18 would lose, and a React 19 run would not show:
 *   • `className` on a custom element is written by React 18 as an attribute of that name, which
 *     is not a class. The component hands over `class`, the one spelling both read as one.
 *   • A prop the component applies itself — an attribute, a property, a callback — is never given
 *     to React. React 18 would stringify it (`[object Object]`), and React 19 would pick a path
 *     for it by the element's class: the very thing the component exists to stop.
 */

// Every call `createElement` receives, passed through to the real one.
const calls = vi.hoisted(() => [] as Array<{ type: unknown; props: Record<string, unknown> }>);
vi.mock('react', async (original) => {
    const actual = await original<typeof import('react')>();
    return {
        ...actual,
        createElement: (type: unknown, props: Record<string, unknown>, ...children: unknown[]) => {
            calls.push({ type, props: { ...props } });
            return (actual.createElement as (...a: unknown[]) => unknown)(type, props, ...children);
        },
    };
});

const { AparteChatViewport, AparteConversationList } = await import('../index');

registerAllComponents();
afterEach(() => {
    cleanup();
    calls.length = 0;
});

/** The props given for the element `tag`, on the last call that was for it. */
const handedFor = (tag: string): Record<string, unknown> => [...calls].reverse().find((c) => c.type === tag)!.props;

describe('what <AparteConversationList> hands to React', () => {
    const noop = (): void => undefined;
    const render_ = () => render(
        <AparteConversationList
            className="wide"
            style={{ minWidth: '12px' }}
            id="chats"
            aria-label="Your chats"
            data-testid="list"
            conversations={[{ id: 'c1', title: 'One' }]}
            active-id="c1"
            flat
            onConversationSelect={noop}
            onConversationDelete={noop}
            onClick={noop}
        />,
    );

    it('hands over `class`, never `className`', () => {
        render_();
        const props = handedFor('aparte-conversation-list');
        expect(props['class']).toBe('wide');
        expect(props).not.toHaveProperty('className');
    });

    it('hands over what React owns on any element: style, id, aria-*, data-* and onClick', () => {
        render_();
        expect(handedFor('aparte-conversation-list')).toMatchObject({
            style: { minWidth: '12px' },
            id: 'chats',
            'aria-label': 'Your chats',
            'data-testid': 'list',
            onClick: noop,
        });
    });

    it('hands over none of the props it applies itself: no attribute, no property, no callback', () => {
        render_();
        const names = Object.keys(handedFor('aparte-conversation-list'));
        for (const own of ['conversations', 'active-id', 'flat', 'onConversationSelect', 'onConversationDelete']) {
            expect(names, own).not.toContain(own);
        }
    });

    it('hands over a ref callback of its own, so it can read the element before the app\'s ref does', () => {
        render_();
        expect(typeof handedFor('aparte-conversation-list')['ref']).toBe('function');
    });
});

describe('what <AparteChatViewport> hands to React', () => {
    it('hands over the attribute the element reads at connect, as the string it is, and leaves the rest', () => {
        render(<AparteChatViewport framework-managed loading />);
        const props = handedFor('aparte-chat-viewport');
        expect(props['framework-managed']).toBe('');
        expect(props).not.toHaveProperty('loading');
    });

    it('hands over nothing for an initial attribute that is off', () => {
        render(<AparteChatViewport framework-managed={false} />);
        expect(handedFor('aparte-chat-viewport')).not.toHaveProperty('framework-managed');
    });
});

// Silences "React is imported and unused" under the JSX transform some tools still ask for.
void React;
