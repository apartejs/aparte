/**
 * `AparteAIProviderMetadata` is importable from the PACKAGE, not only from a module.
 *
 * 0.15.0's changelog said it was exported; the name had been added to
 * `types/index.ts` and never to the root barrel, whose type list is explicit — so
 * `import type { AparteAIProviderMetadata } from '@aparte/core'` was still TS2724 in
 * the published `dist/index.d.ts`. A consumer verified the tarball and said so. This
 * file imports from the barrel and is type-checked by `typecheck:tests`, so a barrel
 * that drops the name again fails the build rather than a changelog.
 */
import { describe, it, expect } from 'vitest';
import type { AparteAIProviderMetadata, AparteAIProvider } from '../index.js';
// The Node entry keeps its own explicit type list too — CI's SSR-barrel guard refused
// the first version of this fix for exactly that: browser barrel yes, Node barrel no.
import type { AparteAIProviderMetadata as NodeMetadata } from '../index.node.js';

describe('@aparte/core barrel — AparteAIProviderMetadata', () => {
    it('is the type getMetadata() returns, reachable by name from the package', () => {
        const meta: AparteAIProviderMetadata = { name: 'Own I/O', id: 'own-io', icon: '<svg/>', color: '#000' };
        const same: ReturnType<AparteAIProvider['getMetadata']> = meta; // the two names are one type
        expect(same.id).toBe('own-io');
    });

    it('is reachable from the Node entry as well', () => {
        const meta: NodeMetadata = { name: 'Own I/O', id: 'own-io', icon: '<svg/>', color: '#000' };
        expect(meta.name).toBe('Own I/O');
    });
});
