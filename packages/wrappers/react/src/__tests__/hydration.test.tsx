/**
 * A server-rendered <AparteChat> hydrates: the HTML a server sent is put in a page where core's
 * elements are defined — so they upgrade on insertion, as in a browser — then React hydrates it.
 *
 * Before `defer-hydration`, the elements drew themselves the moment they were inserted (their
 * children, their attributes, a style on the root) and React's hydration found a DOM it had not
 * rendered: error 418, and the server's HTML thrown away. Measured first in a Next production
 * build (e2e/ssr/next).
 */
import React, { useEffect } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { registerAllComponents } from '@aparte/core';
import { AparteChat } from '../components/AparteChat';

registerAllComponents();

let root: Root | null = null;

afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.replaceChildren();
});

describe('<AparteChat> hydrating server HTML', () => {
    it('hydrates with no mismatch, then the elements draw themselves', async () => {
        const page = () => <AparteChat centerWhenEmpty emptyState={<p>Ask me anything…</p>} />;
        const html = renderToString(page());
        expect(html).toContain('defer-hydration');

        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.append(container);
        // Upgraded, and still as the server sent them.
        expect(container.querySelector('aparte-composer-send')!.innerHTML).toBe('');

        const errors: unknown[] = [];
        await act(async () => {
            root = hydrateRoot(container, page(), { onRecoverableError: (e) => { errors.push(e); } });
        });

        expect(errors).toEqual([]);
        const chat = container.querySelector('[data-aparte-chat]')!;
        expect(chat.hasAttribute('defer-hydration')).toBe(false);
        expect(container.querySelector('aparte-composer-send button')).not.toBeNull();
        expect(container.textContent).toContain('Ask me anything…');
    });

    it('a client-only render never holds the elements', () => {
        const container = document.createElement('div');
        document.body.append(container);
        // Read from a child's effect, which runs BEFORE the chat's own (where a hold would be
        // released): in an app with no server render the elements must already be drawn there.
        const seen: { held: boolean; drawn: boolean }[] = [];
        function Probe() {
            useEffect(() => {
                seen.push({
                    held: !!container.querySelector('[defer-hydration]'),
                    drawn: !!container.querySelector('aparte-composer-send button'),
                });
            }, []);
            return <p>Ask</p>;
        }
        act(() => {
            root = createRoot(container);
            root.render(<AparteChat emptyState={<Probe />} />);
        });
        expect(seen).toEqual([{ held: false, drawn: true }]);
    });
});
