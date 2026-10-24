/**
 * The agent's shared state, as AG-UI streams it: `STATE_SNAPSHOT` replaces it whole
 * (any JSON value, `null` and `0` included) and `STATE_DELTA` patches it with an
 * RFC 6902 JSON Patch. The runner keeps the result per thread and sends it back as the
 * next run's `state`, so a stateful agent finds what it left.
 */

type Container = Record<string, unknown> | unknown[];

const OPS = new Set(['add', 'remove', 'replace', 'move', 'copy', 'test']);

/** An RFC 6901 JSON Pointer as its reference tokens. */
function tokens(pointer: string): string[] {
    if (pointer === '') return [];
    if (!pointer.startsWith('/')) throw new Error(`"${pointer}" is not a JSON Pointer`);
    return pointer.slice(1).split('/').map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function isContainer(value: unknown): value is Container {
    return typeof value === 'object' && value !== null;
}

/** The array index a token names; `-` (past the end) only where `append` allows it. */
function index(list: unknown[], token: string, append: boolean): number {
    if (append && token === '-') return list.length;
    if (!/^(0|[1-9]\d*)$/.test(token)) throw new Error(`"${token}" is not an array index`);
    const i = Number(token);
    if (i > list.length || (!append && i === list.length)) throw new Error(`index ${i} is out of range`);
    return i;
}

/** The container a pointer's last token lives in, and that token. */
function parentOf(doc: unknown, path: string): { parent: Container; key: string } {
    const all = tokens(path);
    const key = all.pop()!;
    let node = doc;
    for (const t of all) {
        if (!isContainer(node)) throw new Error(`"${path}" does not resolve`);
        node = Array.isArray(node) ? node[index(node, t, false)] : (Object.hasOwn(node, t) ? node[t] : undefined);
        if (node === undefined) throw new Error(`"${path}" does not resolve`);
    }
    if (!isContainer(node)) throw new Error(`"${path}" does not resolve`);
    return { parent: node, key };
}

function get(doc: unknown, path: string): unknown {
    if (path === '') return doc;
    const { parent, key } = parentOf(doc, path);
    const value = Array.isArray(parent) ? parent[index(parent, key, false)] : (Object.hasOwn(parent, key) ? parent[key] : undefined);
    if (value === undefined) throw new Error(`"${path}" does not resolve`);
    return value;
}

function add(doc: unknown, path: string, value: unknown): unknown {
    if (path === '') return value;
    const { parent, key } = parentOf(doc, path);
    if (Array.isArray(parent)) parent.splice(index(parent, key, true), 0, value);
    else parent[key] = value;
    return doc;
}

function remove(doc: unknown, path: string): unknown {
    if (path === '') throw new Error('the whole document cannot be removed');
    const { parent, key } = parentOf(doc, path);
    if (Array.isArray(parent)) parent.splice(index(parent, key, false), 1);
    else if (Object.hasOwn(parent, key)) delete parent[key];
    else throw new Error(`"${path}" does not resolve`);
    return doc;
}

function replace(doc: unknown, path: string, value: unknown): unknown {
    if (path === '') return value;
    const { parent, key } = parentOf(doc, path);
    if (Array.isArray(parent)) parent[index(parent, key, false)] = value;
    else if (Object.hasOwn(parent, key)) parent[key] = value;
    else throw new Error(`"${path}" does not resolve`);
    return doc;
}

/** JSON equality, as RFC 6902's `test` means it: key order does not count, array order does. */
function equal(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (!isContainer(a) || !isContainer(b) || Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((v, i) => equal(v, (b as unknown[])[i]));
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** One operation, on a document it may change in place; returns the document. */
function step(doc: unknown, op: Record<string, unknown>): unknown {
    const path = op['path'];
    if (typeof path !== 'string') throw new Error('an operation has no path');
    const from = typeof op['from'] === 'string' ? op['from'] : undefined;
    switch (op['op']) {
        case 'add': return add(doc, path, structuredClone(op['value']));
        case 'remove': return remove(doc, path);
        case 'replace': return replace(doc, path, structuredClone(op['value']));
        case 'move': { if (from === undefined) throw new Error('move has no from'); const value = get(doc, from); return add(remove(doc, from), path, value); }
        case 'copy': { if (from === undefined) throw new Error('copy has no from'); return add(doc, path, structuredClone(get(doc, from))); }
        case 'test': if (!equal(get(doc, path), op['value'])) throw new Error(`test failed at "${path}"`); return doc;
        default: throw new Error(`unknown operation "${String(op['op'])}"`);
    }
}

/**
 * The state after a `STATE_DELTA`. Applied whole or not at all: a patch whose operation
 * fails leaves the state as it was. An operation RFC 6902 does not define is dropped
 * from the patch, the rest applies. Both are told to `warn`; neither fails the run.
 */
export function applyStateDelta(state: unknown, delta: unknown, warn: (message: string) => void): unknown {
    if (!Array.isArray(delta)) {
        warn('Failed to apply state patch: STATE_DELTA carried no list of operations; the state is left as it was.');
        return state;
    }
    const ops: Record<string, unknown>[] = [];
    delta.forEach((op, i) => {
        if (isContainer(op) && !Array.isArray(op) && OPS.has(String(op['op']))) ops.push(op);
        else warn(`dropped /delta/${i}: ${JSON.stringify(op)} is not a JSON Patch operation.`);
    });
    try {
        let doc = structuredClone(state);
        for (const op of ops) doc = step(doc, op);
        return doc;
    } catch (error) {
        warn(`Failed to apply state patch: ${(error as Error).message}; the state is left as it was.`);
        return state;
    }
}
