import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as barrel from '../index';
// @ts-expect-error -- plain ESM tooling, untyped; the shapes it returns are declared below.
import { readCoverageComponents, sampleFor, sampleProperty } from '../../../../../scripts/element-component-coverage.mjs';

/*
 * What Next does with these components on the server: render the element, and nothing else of
 * what the component applies itself.
 *
 * Node environment, `@aparte/core` resolved to its entry without elements — no DOM exists, so
 * the components must render with none. And what they render is what the client's first render
 * produces, or hydration would throw the server's HTML away (React's error 418):
 *
 *   • the element, with `class`, `style`, `children`, `id`, `aria-*` and `data-*` — what React
 *     owns on a custom element under 18 and 19 alike;
 *   • `defer-hydration`, so core's elements leave that HTML alone until React has it (the
 *     elements draw themselves the moment they upgrade, which is before it hydrates);
 *   • no attribute, property or callback the component applies itself after render. It is
 *     also what shows a prop the generator forgot: React would write it, and it would be here.
 */

interface Attr { name: string; type: string }
interface Row { tag: string; component: string; attributes: Attr[]; properties: Attr[]; events: Array<{ prop: string }>; initial: string[] }

const rows = readCoverageComponents() as Row[];
const components = barrel as unknown as Record<string, React.ComponentType<Record<string, unknown>>>;

afterEach(() => vi.restoreAllMocks());

/** Every prop the component takes for itself, with a value for each. */
function ownProps(row: Row): Record<string, unknown> {
    return {
        ...Object.fromEntries(row.attributes.map((a) => [a.name, (sampleFor(a.type, a.name) as { value: unknown }).value])),
        ...Object.fromEntries(row.properties.map((p) => [p.name, sampleProperty(p.type)])),
        ...Object.fromEntries(row.events.map((e) => [e.prop, () => undefined])),
    };
}

describe('on the server', () => {
    it('renders every component, from the manifest\'s list', () => {
        expect(rows.length).toBeGreaterThanOrEqual(20);
    });

    for (const row of rows) {
        it(`${row.component} is the bare element, held until React hydrates it`, () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const Component = components[row.component]!;
            const html = renderToStaticMarkup(<Component {...ownProps(row)} />);
            // The attributes the element reads at connect are in its markup; the rest are not.
            const initial = row.initial.map((name) => {
                const attribute = (sampleFor(row.attributes.find((a) => a.name === name)!.type, name) as { attribute: string }).attribute;
                return ` ${name}="${attribute}"`;
            }).join('');
            expect(html).toBe(`<${row.tag}${initial} defer-hydration=""></${row.tag}>`);
            // No warning either: React 18 says so when a layout effect is declared on the server.
            expect(error).not.toHaveBeenCalled();
        });
    }

    it('renders what React owns on a custom element: class, style, id, aria-*, data-*, and the children', () => {
        const row = rows.find((r) => r.tag === 'aparte-conversation-list')!;
        const Component = components[row.component]!;
        const html = renderToStaticMarkup(
            <Component className="side" style={{ minWidth: '12px' }} id="chats" aria-label="Your chats" data-testid="list">
                <span>kid</span>
            </Component>,
        );
        expect(html).toBe(
            '<aparte-conversation-list class="side" style="min-width:12px" id="chats" aria-label="Your chats" data-testid="list" defer-hydration="">'
            + '<span>kid</span></aparte-conversation-list>',
        );
    });
});
