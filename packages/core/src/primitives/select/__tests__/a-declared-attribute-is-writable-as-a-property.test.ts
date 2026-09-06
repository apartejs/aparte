// @vitest-environment jsdom
/**
 * A declared attribute is writable as a PROPERTY, not only as an attribute.
 *
 * React 19 and Svelte 5 both write a value onto the element when a property of that
 * name is in it, and fall back to `setAttribute` only when it is not. So a declared
 * attribute backed by a getter with no setter is not a no-op: the assignment throws
 * ("Cannot set property … which has only a getter") and takes the whole render down —
 * `<aparte-optgroup collapsible>` in JSX did exactly that.
 *
 * The second test is the shape rather than the case: an accessor a framework can reach
 * by name must have both halves. A declared attribute with no property at all is fine —
 * `in` is false, so every framework writes the attribute.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AparteSelect } from '../aparte-select.js';
import { AparteOption } from '../aparte-option.js';
import { AparteOptgroup } from '../aparte-optgroup.js';

const mounted: HTMLElement[] = [];

afterEach(() => { while (mounted.length) mounted.pop()!.remove(); });

function mountOptgroup(): AparteOptgroup {
    const el = document.createElement('aparte-optgroup') as AparteOptgroup;
    el.setAttribute('label', 'Ollama');
    document.body.appendChild(el);
    mounted.push(el);
    return el;
}

describe('<aparte-optgroup>.collapsible', () => {
    it('adds the attribute when a framework assigns the property', () => {
        const el = mountOptgroup();

        el.collapsible = true;

        expect(el.hasAttribute('collapsible')).toBe(true);
        expect(el.collapsible).toBe(true);
    });

    it('removes the attribute when the property is assigned false', () => {
        const el = mountOptgroup();
        el.setAttribute('collapsible', '');

        el.collapsible = false;

        expect(el.hasAttribute('collapsible')).toBe(false);
        expect(el.collapsible).toBe(false);
    });
});

describe('every attribute the select primitives declare', () => {
    const camel = (attr: string) => attr.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

    function accessor(proto: object, name: string): PropertyDescriptor | undefined {
        for (let p: object | null = proto; p; p = Object.getPrototypeOf(p)) {
            const d = Object.getOwnPropertyDescriptor(p, name);
            if (d) return d;
        }
        return undefined;
    }

    it('is either absent as a property or writable as one — never getter-only', () => {
        const getterOnly: string[] = [];

        for (const ctor of [AparteSelect, AparteOption, AparteOptgroup] as const) {
            for (const attr of ctor.observedAttributes) {
                const name = camel(attr);
                const d = accessor(ctor.prototype, name);
                if (d && d.get && !d.set) getterOnly.push(`${ctor.name}[${attr}] -> .${name}`);
            }
        }

        expect(getterOnly).toEqual([]);
    });
});
