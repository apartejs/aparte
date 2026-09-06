import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A shell built from the contract's own list must still behave like a bubble.
 *
 * `AparteBubbleShellRenderer` enumerates the class hooks the bubble looks for, and an
 * author copies that list. It listed eight of the twelve, so a shell written from it
 * dropped the painted content box, the waiting indicator with its screen-reader label,
 * the footer and the branch live region — and two of those fail SILENTLY: the reader
 * gets no "thinking" state, and a screen-reader user gets no announcement when the
 * branch moves.
 *
 * So the list itself is the fixture. The shell below is assembled from the class names
 * parsed out of the doc comment, not from a copy of them: a hook that leaves the
 * documentation leaves this test's shell, and the assertion that needs it goes red.
 */

import '../../components/bubble/aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../index.js';
import { coreRoot } from '../../__tests__/read-stylesheet.js';

/**
 * The bullet list alone — the prose under it names classes for other reasons (the two
 * that fail silently, the two that only carry the layout), and those are not hooks the
 * shell has to render.
 */
function bulletList(): string {
    const src = readFileSync(resolve(coreRoot(), 'src/config/bubble-shell-renderer.ts'), 'utf8');
    const doc = src.slice(0, src.indexOf('export type'));
    const list = doc.slice(doc.indexOf('- Include the region hooks'));
    const end = list.indexOf('\n *\n');
    return end === -1 ? list : list.slice(0, end);
}

/** Every `.aparte-…` class the contract's bullet list names, in the order it names them. */
function documentedHooks(): string[] {
    const names = [...bulletList().matchAll(/`\.(aparte-[a-z-]+)`/g)].map((m) => m[1]);
    // `.aparte-message` is the ROOT, named again by the `@returns` line; the shell below
    // draws it once, around the rest.
    return [...new Set(names)].filter((n) => n !== 'aparte-message');
}

/**
 * The hooks the `.aparte-message-content` bullet says that box HOLDS.
 *
 * Containment is load-bearing exactly here: the background, radius and padding of a user
 * message are declared on the box, so a shell that renders the segments, the text and the
 * waiting dots as its SIBLINGS keeps every behaviour and loses the bubble. Presence is
 * all the bubble's queries ask for, which is why only the documentation can carry this —
 * so the shell below nests whatever this bullet names, and the clause cannot drift from
 * the fixture.
 */
function documentedContentBoxChildren(): string[] {
    const list = bulletList();
    const bullet = list.slice(list.indexOf('`.aparte-message-content`'));
    const next = bullet.indexOf('\n *   - `');
    const own = next === -1 ? bullet : bullet.slice(0, next);
    const names = [...own.matchAll(/`\.(aparte-[a-z-]+)`/g)].map((m) => m[1]);
    return [...new Set(names)].filter((n) => n !== 'aparte-message-content');
}

type BubbleEl = HTMLElement & {
    setSiblings(count: number, index: number): void;
};

/**
 * The shell honours every containment the contract states, and nothing it does not: the
 * branch status inside the picker, the screen-reader label inside the waiting region, and
 * the three the painted box holds. What is left goes in one flat row under the root.
 */
function shellFrom(hooks: string[], role: string): string {
    const boxed = documentedContentBoxChildren();
    const node = (h: string): string => {
        if (h === 'aparte-branch-picker') {
            const status = hooks.includes('aparte-branch-status')
                ? `<span class="aparte-sr-only aparte-branch-status" aria-live="polite"></span>`
                : '';
            return `<div class="aparte-branch-picker" hidden><span class="aparte-branch-label"></span>${status}</div>`;
        }
        if (h === 'aparte-waiting') {
            const label = hooks.includes('aparte-sr-only') ? `<span class="aparte-sr-only"></span>` : '';
            // The dots are markup the SHELL authors: the bubble only shows and hides the
            // region, so a shell that renders the label alone has a waiting state nothing
            // paints. Built from the bullet list like everything else here, so the clause
            // and this fixture cannot drift apart.
            const dots = hooks.includes('aparte-dots')
                ? `<span class="aparte-dots" aria-hidden="true">${'<span class="aparte-dot"></span>'.repeat(3)}</span>`
                : '';
            return `<div class="aparte-waiting" hidden>${dots}${label}</div>`;
        }
        if (h === 'aparte-message-content') {
            return `<div class="aparte-message-content">${boxed.map(node).join('')}</div>`;
        }
        return `<div class="${h}"></div>`;
    };
    const nested = ['aparte-branch-status', 'aparte-sr-only', 'aparte-dots', 'aparte-dot'];
    const inner = hooks
        .filter((h) => !nested.includes(h) && !boxed.includes(h))
        .map(node)
        .join('');
    return `<div class="aparte-message" data-role="${role}">${inner}</div>`;
}

describe('a shell built from the documented contract', () => {
    afterEach(() => aparteGlobalConfig.reset());

    it('names the region hooks, the five that were missing included', () => {
        const hooks = documentedHooks();
        for (const name of [
            'aparte-message-content',
            'aparte-waiting',
            'aparte-sr-only',
            'aparte-footer',
            'aparte-branch-status',
        ]) {
            expect(hooks).toContain(name);
        }
    });

    it('says the painted box holds the segments, the text and the waiting dots', () => {
        expect(documentedContentBoxChildren()).toEqual([
            'aparte-segments',
            'aparte-content',
            'aparte-waiting',
        ]);
    });

    it('keeps the waiting indicator, with its accessible label', () => {
        aparteGlobalConfig.setBubbleShellRenderer(({ role }) => shellFrom(documentedHooks(), role));
        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'assistant');
        el.setAttribute('message-id', 'shell-w');
        el.setAttribute('streaming', '');
        document.body.appendChild(el);

        // Inside the painted box, because that is where the contract says it goes — a
        // sibling here is the shell that renders a user message with no bubble.
        const waiting = el.querySelector('.aparte-message-content > .aparte-waiting') as HTMLElement | null;
        expect(waiting).not.toBeNull();
        expect(waiting!.hidden).toBe(false);
        expect(waiting!.textContent).toContain(aparteGlobalConfig.getLocale().typing);
        // And something a SIGHTED reader can see. `.aparte-waiting` paints nothing on its
        // own — `styles/segment/thinking.css` animates `.aparte-dot`, so a shell built from
        // a contract that names only the label has a thinking state only a screen reader
        // perceives, and Playwright cannot even screenshot the region ("not visible").
        expect(waiting!.querySelectorAll('.aparte-dot').length).toBe(3);
        el.remove();
    });

    it('gets the role and the accessible name the bubble gives its own shell', () => {
        aparteGlobalConfig.setBubbleShellRenderer(({ role }) => shellFrom(documentedHooks(), role));
        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'assistant');
        el.setAttribute('message-id', 'shell-r');
        document.body.appendChild(el);

        // Not asked of the author: the contract lists CLASS hooks, so a shell written from
        // it carries no ARIA, and the transcript loses one article and one name per custom
        // bubble. The bubble re-applies both after the shell renders (decision #8: honoured
        // end to end), which is why no existing shell has to change.
        const message = el.querySelector('.aparte-message') as HTMLElement | null;
        expect(message).not.toBeNull();
        expect(message!.getAttribute('role')).toBe('article');
        expect(message!.getAttribute('aria-label')).toBeTruthy();
        el.remove();
    });

    it('leaves the role and the accessible name alone when the shell declares its own', () => {
        aparteGlobalConfig.setBubbleShellRenderer(({ role }) =>
            shellFrom(documentedHooks(), role).replace(
                'class="aparte-message"',
                'class="aparte-message" role="listitem" aria-label="mine"',
            ));
        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'assistant');
        el.setAttribute('message-id', 'shell-o');
        document.body.appendChild(el);

        // The contract says a root that already carries a `role` is how you override the
        // default. An override that kept the role and lost the name would be half of one:
        // the bubble refreshes the accessible name on every role change, and that refresh
        // must stop at a root whose role it did not write.
        el.setAttribute('data-role', 'user');
        const message = el.querySelector('.aparte-message') as HTMLElement | null;
        expect(message).not.toBeNull();
        expect(message!.getAttribute('role')).toBe('listitem');
        expect(message!.getAttribute('aria-label')).toBe('mine');
        el.remove();
    });

    it('announces a branch move through the live region', () => {
        aparteGlobalConfig.setBubbleShellRenderer(({ role }) => shellFrom(documentedHooks(), role));
        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'assistant');
        el.setAttribute('message-id', 'shell-b');
        document.body.appendChild(el);

        el.setSiblings(3, 1);
        const status = el.querySelector('.aparte-branch-status') as HTMLElement | null;
        expect(status).not.toBeNull();
        expect(status!.getAttribute('aria-live')).toBe('polite');
        expect(status!.textContent).toBe('2 / 3');
        el.remove();
    });
});
