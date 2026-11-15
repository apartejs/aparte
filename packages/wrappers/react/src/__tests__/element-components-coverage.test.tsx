import React, { createRef } from 'react';
import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { registerAllComponents } from '@aparte/core';
import * as barrel from '../index';
// @ts-expect-error -- plain ESM tooling, untyped; the shapes it returns are declared below.
import { readCoverageComponents, sampleFor, sampleProperty } from '../../../../../scripts/element-component-coverage.mjs';
// @ts-expect-error -- plain ESM tooling, untyped; the same two functions the chat's coverage test sends events with.
import { detailFor, fire } from '../../../../../scripts/chat-event-coverage.mjs';

/*
 * Every element core declares has its component, and each component carries everything its
 * element has: every attribute lands on the element, every property is assigned, and every
 * event reaches its callback once, with the detail and then the event.
 *
 * The list is core's MANIFEST (`scripts/element-component-coverage.mjs`), never the file the
 * components are generated into: an element, an attribute or an event a generator dropped from
 * its table is one this test still tries. That is what "complete by construction" has to mean
 * here, and what the chat's own coverage test (`chat-events-coverage.test.tsx`) does for the
 * 23 events of `<AparteChat>`. Each event is sent from the element that sends it, as core
 * sends it: bubbling and composed, and cancelable so that `preventDefault()` can be tried on
 * every one.
 */

registerAllComponents();

interface Attr { name: string; type: string }
interface Event_ { name: string; prop: string; detail: string | null; cancelable: boolean }
interface Row { tag: string; component: string; attributes: Attr[]; properties: Attr[]; events: Event_[] }

const rows = readCoverageComponents() as Row[];
const components = barrel as unknown as Record<string, React.ComponentType<Record<string, unknown>> | undefined>;

afterEach(() => cleanup());

/** The component for `row`, with a mock on each callback it has. */
function renderRow(row: Row, props: Record<string, unknown> = {}): { el: HTMLElement; handlers: Map<string, Mock> } {
    const Component = components[row.component]!;
    const handlers = new Map(row.events.map((ev) => [ev.prop, vi.fn()]));
    const ref = createRef<HTMLElement>();
    render(<Component {...Object.fromEntries(handlers)} {...props} ref={ref} />);
    return { el: ref.current!, handlers };
}

describe('every element but the chat has a component', () => {
    it('reads at least twenty elements from the manifest', () => {
        expect(rows.length).toBeGreaterThanOrEqual(20);
    });

    it('leaves `<AparteChat>` the chat\'s name: it is the composite, not a generated element', () => {
        expect(rows.map((r) => r.tag)).not.toContain('aparte-chat');
        expect(typeof components['AparteChat']).toBe('object');
    });

    for (const row of rows) {
        it(`${row.component} is exported, and is the element <${row.tag}>`, () => {
            expect(components[row.component], `${row.component} is exported from the barrel`).toBeDefined();
            const { el } = renderRow(row);
            expect(el, 'the ref is the element').not.toBeNull();
            expect(el.localName).toBe(row.tag);
        });
    }
});

describe('every attribute of an element is a prop that is written onto it', () => {
    for (const row of rows.filter((r) => r.attributes.length)) {
        it(`${row.component}: ${row.attributes.map((a) => a.name).join(', ')}`, () => {
            const samples = row.attributes.map((a) => ({ ...a, ...(sampleFor(a.type, a.name) as { value: unknown; attribute: string }) }));
            // What the component wrote, not what the element kept: the split clamps its own `position`.
            const setAttribute = vi.spyOn(Element.prototype, 'setAttribute');
            const { el } = renderRow(row, Object.fromEntries(samples.map((s) => [s.name, s.value])));
            const written = setAttribute.mock.calls
                .filter((_call, i) => setAttribute.mock.contexts[i] === el)
                .map(([name, value]) => `${name}=${value}`);
            setAttribute.mockRestore();
            const missing = samples
                .filter((s) => !written.includes(`${s.name}=${s.attribute}`))
                .map((s) => `${s.name} (${s.type}): ${JSON.stringify(s.value)} was never written as ${JSON.stringify(s.attribute)}`);
            expect(missing).toEqual([]);
        });
    }
});

describe('every property-only member of an element is a prop assigned to it', () => {
    const withProperties = rows.filter((r) => r.properties.length);
    it('finds the one the issue could not reach: the rows of the conversation list', () => {
        expect(withProperties.map((r) => [r.tag, r.properties.map((p) => p.name)])).toContainEqual(['aparte-conversation-list', ['conversations']]);
    });

    for (const row of withProperties) {
        for (const prop of row.properties) {
            it(`${row.component}: ${prop.name} is the element's property, and no attribute`, () => {
                const value = sampleProperty(prop.type);
                const { el } = renderRow(row, { [prop.name]: value });
                expect((el as unknown as Record<string, unknown>)[prop.name]).toBe(value);
                expect(el.hasAttribute(prop.name)).toBe(false);
            });
        }
    }
});

describe('every event of an element reaches its callback', () => {
    const withEvents = rows.filter((r) => r.events.length);

    it('tests at least thirty callbacks', () => {
        expect(withEvents.reduce((n, r) => n + r.events.length, 0)).toBeGreaterThanOrEqual(30);
    });

    for (const row of withEvents) {
        for (const ev of row.events) {
            it(`${row.component}: ${ev.name} → ${ev.prop}(detail, event), once`, () => {
                const { el, handlers } = renderRow(row);
                const detail = detailFor(ev);
                let sent!: { event: CustomEvent; result: boolean };
                act(() => { sent = fire(el, { ...ev }, detail); });
                const handler = handlers.get(ev.prop)!;
                expect(handler).toHaveBeenCalledTimes(1);
                expect(handler).toHaveBeenCalledWith(detail, sent.event);
                for (const [prop, other] of handlers) {
                    if (other !== handler) expect(other, `${prop} heard ${ev.name}`).not.toHaveBeenCalled();
                }
            });

            it(`${row.component}: event.preventDefault() in ${ev.prop} reaches the sender of ${ev.name}`, () => {
                const { el, handlers } = renderRow(row);
                handlers.get(ev.prop)!.mockImplementation((_detail: unknown, event: Event) => event.preventDefault());
                let result = true;
                act(() => { result = (fire(el, { ...ev, cancelable: true }, detailFor(ev)) as { result: boolean }).result; });
                expect(result).toBe(false);
            });
        }
    }
});
