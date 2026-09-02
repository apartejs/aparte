/**
 * The conversation list's events are subject-first, like every other event of the
 * library — and `flat` replaces the one negative boolean (pre-1.0 renames, before the
 * beta freezes the surface).
 *
 * Every other event reads subject then verb: `aparte-select-change`, `aparte-message-start`,
 * `aparte-segment-update`, `aparte-split-resize`. The conversation list's seven read verb
 * then subject — `aparte-select-conversation`, `aparte-delete-conversation` — while their
 * detail types were ALREADY subject-first (`AparteConversationSelectDetail`), so one
 * `addEventListener` line carried both orders. And `no-groups` was the only negative
 * boolean attribute: `flat` says what it does, and covers the loss of the "pinned first"
 * order the same flag also removed.
 *
 * Renamed outright, no aliases: an alpha breaks cleanly and says so in the changeset.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from '../../__tests__/read-stylesheet.js';

const read = (rel: string) => readFileSync(resolve(coreRoot(), rel), 'utf8');
const VERBS = ['select', 'delete', 'archive', 'unarchive', 'rename', 'pin', 'unpin'];
const OLD = VERBS.map((v) => `aparte-${v}-conversation`);
const NEW = VERBS.map((v) => `aparte-conversation-${v}`);

describe('the conversation list’s events', () => {
    const eventMap = read('src/types/event-map.ts');
    const element = read('src/components/conversation-list/aparte-conversation-list.ts');
    const props = read('src/interop/element-props.ts');
    const controller = read('src/conversations/conversation-controller.ts');

    it('are subject-first in the event map, the element’s @fires, the interop list and the controller', () => {
        for (const name of NEW) {
            expect(eventMap, `event map: ${name}`).toContain(`'${name}'`);
            expect(element, `@fires ${name}`).toMatch(new RegExp(`@fires \\{[^}]+\\} ${name}\\b`));
            expect(props, `interop: ${name}`).toContain(`'${name}'`);
        }
        expect(controller).toContain(`'aparte-conversation-select'`);
    });

    it('carry no alias for the old verb-first names anywhere in core', () => {
        for (const source of [eventMap, element, props, controller]) {
            for (const name of OLD) expect(source, `old name ${name} still present`).not.toContain(name);
        }
    });
});

describe('the conversation list’s flat attribute', () => {
    const element = read('src/components/conversation-list/aparte-conversation-list.ts');

    it('is `flat`, observed and documented, and `no-groups` is gone', () => {
        expect(element).toMatch(/observedAttributes[\s\S]*?\['active-id', 'flat'\]/);
        expect(element).toMatch(/@attr \{boolean\} flat -/);
        expect(element).toContain(`hasAttribute('flat')`);
        expect(element).not.toContain('no-groups');
    });
});
