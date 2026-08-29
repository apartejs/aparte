/**
 * The worker, when this package is served from another origin.
 *
 * `new Worker()` refuses a cross-origin script outright, and that is not the exotic
 * case it sounds like: it is every deploy whose JavaScript sits on a CDN or an asset
 * host while the page sits somewhere else — with or without a bundler. Reproduced with
 * the built package on one port and the page on another: `SecurityError: Script at
 * 'http://localhost:8572/…/assets/worker-*.js' cannot be accessed from origin
 * 'http://localhost:8571'`.
 *
 * jsdom has no worker and no origin checks, so what it can pin is the DECISION: which
 * URL the provider hands to `new Worker`, whether a blob was minted, and whether that
 * blob is released when the worker goes. The browser half — that the blob actually
 * crosses the origin — is a two-origin page driven in Chromium, which is how the fix
 * was verified before it shipped.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { terminateWorker, TransformersProvider, registerModel } from '../index';

const constructedWith: string[] = [];
const created: string[] = [];
const revoked: string[] = [];

class StubWorker {
    constructor(url: string | URL) { constructedWith.push(String(url)); }
    addEventListener = vi.fn();
    postMessage = vi.fn();
    terminate = vi.fn();
}

/** Force the module's view of where it is served from, then where the page is. */
function stubOrigins(): void {
    vi.stubGlobal('Worker', StubWorker);
    vi.stubGlobal('URL', class extends URL {
        static override createObjectURL(blob: Blob): string {
            const url = `blob:http://page.example/${created.length}`;
            created.push(url);
            void blob;
            return url;
        }
        static override revokeObjectURL(url: string): void { revoked.push(url); }
    });
}

beforeEach(() => {
    constructedWith.length = 0;
    created.length = 0;
    revoked.length = 0;
    stubOrigins();
    registerModel({ id: 'stub/model', name: 'stub', task: 'text-generation', capabilities: ['streaming'] });
});

afterEach(() => {
    terminateWorker();
    vi.unstubAllGlobals();
});

/** Spawning is lazy: the provider builds its worker on first use. */
const touchWorker = async (): Promise<void> => {
    void TransformersProvider.prepareModel?.('stub/model', () => {}).catch(() => {});
    // `prepareModel` reads the cache before it spawns, so let its microtasks run.
    await Promise.resolve();
    await Promise.resolve();
};

describe('the worker crosses an origin', () => {
    it('goes through a blob when the package is served from another origin', async () => {
        // The page is somewhere else than the module: exactly a CDN deploy.
        vi.stubGlobal('location', { origin: 'http://page.example' } as Location);
        await touchWorker();

        expect(created, 'a cross-origin package must mint a blob to carry its worker').toHaveLength(1);
        expect(constructedWith[0]).toBe(created[0]);
        expect(constructedWith[0]).toMatch(/^blob:/);
    });

    it('releases that blob when the worker is terminated', async () => {
        vi.stubGlobal('location', { origin: 'http://page.example' } as Location);
        await touchWorker();
        expect(revoked).toHaveLength(0);   // not before: the worker is still loading from it

        terminateWorker();
        expect(revoked, 'the blob outlives the worker otherwise').toEqual(created);
    });

    // The same-origin path is not pinned here on purpose: every other test in this
    // package spawns the worker that way through the stub, so a break in it fails thirty
    // assertions elsewhere. What could only be written here — that a cross-origin package
    // mints a blob and releases it — is above; that the blob actually crosses the origin
    // is a two-origin page in Chromium, which is how this fix was verified before it
    // shipped (a same-origin assertion in jsdom cannot see an origin check at all).

});
