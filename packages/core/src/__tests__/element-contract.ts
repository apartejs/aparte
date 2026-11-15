/**
 * The contract every element of a manifest keeps when a wrapper hands it what it already holds.
 *
 * A framework re-applies a whole prop bag when the bag changes identity, and an array mutated in
 * place is handed back as itself (a Vue `push` behind a deep watch, a Svelte 5 proxy, Svelte 4's
 * `arr = arr`). So, for every element a package's manifest declares:
 *
 *   - an ATTRIBUTE written again with the value it has changes nothing under the element: an
 *     attribute is a string, and the same string is no news;
 *   - a PROPERTY assigned again with its own value keeps what the person was doing: the focus,
 *     what is open, what is selected or pressed. The element may draw again (the value may have
 *     been mutated), but not from scratch.
 *
 * Read from the manifest rather than listed, so an element or a member added later is held to it
 * with no edit here. Shared by core and every plugin that ships a manifest: each calls
 * {@link describeElementContract} with its own, and the fixtures that bring its elements into a
 * state worth keeping.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';

interface ManifestMember {
    kind: string;
    name: string;
    static?: boolean;
    readonly?: boolean;
    privacy?: string;
    attribute?: string;
    fieldName?: string;
}
interface ManifestAttribute {
    name: string;
    fieldName?: string;
    default?: string;
    type?: { text?: string };
}
interface ManifestElement {
    tagName: string;
    customElement?: boolean;
    attributes?: ManifestAttribute[];
    members?: ManifestMember[];
}

/** How to bring one element into a state worth keeping. */
export interface ElementFixture {
    /** Where the element goes: return the node to append to the document (the element itself by default). */
    mount?: (el: HTMLElement) => Node;
    /** Values for its properties, assigned before the state is set up (their current value otherwise). */
    properties?: Record<string, unknown>;
    /** What the person does in it: open a menu, focus a row, select a line. May be async. */
    use?: (el: HTMLElement) => void | Promise<void>;
    /** Attributes or properties this element is not held to, with the reason. */
    skip?: Record<string, string>;
}

const camel = (name: string): string => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/**
 * The manifest of the package at `pkg` (repo-relative: `packages/core`). Found by walking up from
 * the cwd, like `read-stylesheet.ts`: under Vite `import.meta.url` is not a file URL, and the cwd
 * is the package under `nx test` and the repo under the root `pnpm test`.
 */
export function manifestOf(pkg: string): string {
    for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
        const file = join(dir, pkg, 'dist', 'custom-elements.json');
        if (existsSync(file)) return file;
    }
    throw new Error(`no manifest for ${pkg} from ${process.cwd()} — run the package's \`analyze\` (or build) first.`);
}

/** The elements a manifest declares. A missing manifest fails: a guard with nothing to read is not a pass. */
export function readManifestElements(file: string): ManifestElement[] {
    if (!existsSync(file)) throw new Error(`no manifest at ${file} — run the package's \`analyze\` (or build) first.`);
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as { modules?: { declarations?: ManifestElement[] }[] };
    const elements = (manifest.modules ?? []).flatMap((m) => m.declarations ?? []).filter((d) => d.customElement && d.tagName);
    if (!elements.length) throw new Error(`${file} declares no custom element — that is not a pass.`);
    return elements;
}

/** The public, writable fields the element has no attribute for: the generator's own rule for a property. */
export function propertyOnlyMembers(el: ManifestElement): string[] {
    const mirrored = new Set((el.attributes ?? []).flatMap((a) => [a.name, camel(a.name), a.fieldName].filter(Boolean) as string[]));
    return (el.members ?? []).filter((m) =>
        m.kind === 'field'
        && !m.static
        && !m.readonly
        && (m.privacy === undefined || m.privacy === 'public')
        && !m.name.startsWith('_')
        && !mirrored.has(m.name)).map((m) => m.name);
}

/** A value the attribute can take: its default, the first literal of its type, or a token. */
function sampleOf(attr: ManifestAttribute): string {
    const type = attr.type?.text ?? '';
    if (/\bboolean\b/.test(type)) return '';
    if (/\bnumber\b/.test(type)) return attr.default && /^\d/.test(attr.default) ? attr.default : '1';
    const literal = /'([^']*)'|"([^"]*)"/.exec(type);
    if (literal) return literal[1] ?? literal[2] ?? '';
    if (attr.default) return attr.default.replace(/^['"]|['"]$/g, '');
    return 'x';
}

const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

/** Where `node` sits under `root`, as the tags and indexes down to it: the same place after a redraw. */
function placeOf(root: Node, node: Node | null): string | null {
    if (!node || !root.contains(node)) return null;
    const steps: string[] = [];
    for (let at: Node | null = node; at && at !== root; at = at.parentNode) {
        const parent = at.parentNode;
        const index = parent ? Array.prototype.indexOf.call(parent.childNodes, at) : -1;
        steps.unshift(`${(at as Element).tagName ?? '#'}[${index}]`);
    }
    return steps.join('/');
}

const STATE = ['aria-expanded', 'aria-selected', 'aria-pressed', 'aria-checked', 'open', 'data-active', 'data-selected', 'hidden', 'data-open'];

/** What the person sees of what they did: which nodes are open, selected, pressed, and what a field holds. */
function stateOf(root: HTMLElement): string[] {
    const out: string[] = [];
    for (const node of root.querySelectorAll('*')) {
        const marks = STATE.filter((name) => node.hasAttribute(name)).map((name) => `${name}=${node.getAttribute(name)}`);
        if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) marks.push(`value=${node.value}`);
        if (marks.length) out.push(`${placeOf(root, node)} ${marks.join(' ')}`);
    }
    return out;
}

/** The mutations under `el` while `act` runs, but the one `act` makes on `el`'s attribute `name`. */
async function mutationsDuring(el: HTMLElement, name: string, act: () => void): Promise<string[]> {
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => records.push(...list));
    observer.observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
    act();
    await settle();
    records.push(...observer.takeRecords());
    observer.disconnect();
    return records
        .filter((r) => !(r.type === 'attributes' && r.target === el && r.attributeName === name))
        .map((r) => `${r.type} ${r.attributeName ?? ''} on ${placeOf(el, r.target) || el.tagName}`);
}

/**
 * Hold every element of `manifest` to the contract. `fixtures` by tag; an element the document
 * does not define fails, since the manifest says the package defines it.
 */
export function describeElementContract(manifest: string, fixtures: Record<string, ElementFixture> = {}): void {
    const elements = readManifestElements(manifest);

    describe('an element handed what it already holds', () => {
        afterEach(() => {
            document.body.replaceChildren();
        });

        async function mount(tag: string): Promise<HTMLElement> {
            expect(customElements.get(tag), `<${tag}> is in the manifest, so the package defines it`).toBeTruthy();
            const el = document.createElement(tag);
            const fixture = fixtures[tag];
            document.body.append(fixture?.mount?.(el) ?? el);
            for (const [name, value] of Object.entries(fixture?.properties ?? {})) (el as unknown as Record<string, unknown>)[name] = value;
            await settle();
            return el;
        }

        for (const element of elements) {
            const tag = element.tagName;
            const skip = fixtures[tag]?.skip ?? {};

            // An element with nothing to set still has a row: the manifest's word that it is defined.
            it(`<${tag}> is defined by the package that declares it`, () => {
                expect(customElements.get(tag)).toBeTruthy();
            });

            const attributes = (element.attributes ?? []).filter((a) => !(a.name in skip));
            if (attributes.length) {
                it.each(attributes.map((a) => [a.name, a] as const))(`<${tag}> [%s] written again changes nothing`, async (_name, attr) => {
                    const el = await mount(tag);
                    if (!el.hasAttribute(attr.name)) {
                        el.setAttribute(attr.name, sampleOf(attr));
                        await settle();
                    }
                    const value = el.getAttribute(attr.name)!;
                    const changed = await mutationsDuring(el, attr.name, () => el.setAttribute(attr.name, value));
                    expect(changed, `<${tag}> reacted to ${attr.name}="${value}", the value it already had`).toEqual([]);
                });
            }

            // The property-only members, and any the fixture gives a value: a property that also
            // has an attribute (the suggestions' JSON) still takes an array a wrapper re-assigns.
            const given = Object.keys(fixtures[tag]?.properties ?? {});
            const properties = [...new Set([...propertyOnlyMembers(element), ...given])].filter((name) => !(name in skip));
            if (properties.length) {
                it.each(properties.map((name) => [name] as const))(`<${tag}>.%s assigned again keeps the state`, async (name) => {
                    const el = await mount(tag);
                    await fixtures[tag]?.use?.(el);
                    await settle();
                    const record = el as unknown as Record<string, unknown>;
                    const value = record[name];
                    const focus = placeOf(el, document.activeElement);
                    const before = stateOf(el);
                    record[name] = value;
                    await settle();
                    expect(placeOf(el, document.activeElement), `<${tag}>.${name}: the focus moved`).toBe(focus);
                    expect(stateOf(el), `<${tag}>.${name}: what was open, selected or typed changed`).toEqual(before);
                });
            }
        }
    });
}
