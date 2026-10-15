/**
 * Every live demo of the site, by id: the guides' scenarios and the catalogue's variants.
 * `/preview/demo/[id]` builds one document per entry; `<Demo>` and `<Variant>` print one.
 */
import { CHAT_DEMOS } from './chat';
import { GUIDE_DEMOS } from './guide';
import type { DemoEntry } from './types';

export type { DemoEntry } from './types';

export const DEMOS: DemoEntry[] = [...GUIDE_DEMOS, ...CHAT_DEMOS];

// Two demos under one id would build one frame and show the other's code: refuse the build.
const seen = new Set<string>();
for (const demo of DEMOS) {
    if (seen.has(demo.id)) throw new Error(`Two demos share the id "${demo.id}" (src/data/demos/).`);
    seen.add(demo.id);
}

export function findDemo(id: string): DemoEntry | undefined {
    return DEMOS.find((demo) => demo.id === id);
}
