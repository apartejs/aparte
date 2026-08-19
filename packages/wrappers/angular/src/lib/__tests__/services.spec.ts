import { describe, it, expect, vi, afterEach } from 'vitest';
import '@angular/compiler';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AparteConfig, type AparteConversation, type AparteStorageAdapter } from '@aparte/core';
import { provideAparte, APARTE_CONFIG_TOKEN } from '../provide-aparte';
import { APARTE_CLIENT_OPTIONS, AparteAiService } from '../aparte-ai.service';
import { ConversationManagerService } from '../conversation-manager.service';

/**
 * The DI surface this wrapper ships alongside its components: the two injection
 * tokens and the conversation-manager service. `provideAparte` was covered (it
 * auto-connects the client), but nothing asserted that the tokens it advertises are
 * actually injectable, nor that the manager service works — the same untested
 * "annex API" gap the other three wrappers had.
 */

class MemoryAdapter implements AparteStorageAdapter {
    store = new Map<string, AparteConversation>();
    async loadAll() { return [...this.store.values()].sort((a, b) => b.updatedAt - a.updatedAt); }
    async save(c: AparteConversation) { this.store.set(c.id, c); }
    async delete(id: string) { this.store.delete(id); }
    async archive(id: string) {
        const c = this.store.get(id);
        if (c) this.store.set(id, { ...c, archivedAt: Date.now() });
    }
    async unarchive(id: string) {
        const c = this.store.get(id);
        if (c) { const { archivedAt: _archivedAt, ...rest } = c; this.store.set(id, rest as AparteConversation); }
    }
}

afterEach(() => {
    vi.restoreAllMocks();
    AparteConfig.setConversationManager(null as never);
});

describe('provideAparte — injection tokens', () => {
    it('exposes the options it was given through APARTE_CONFIG_TOKEN', async () => {
        vi.spyOn(AparteAiService.prototype, 'connect').mockImplementation(() => undefined);
        const options = { autoConnect: false, theme: 'dark' as const };
        TestBed.configureTestingModule({ providers: [provideAparte(options)] });
        await TestBed.inject(ApplicationInitStatus).donePromise;

        expect(TestBed.inject(APARTE_CONFIG_TOKEN)).toEqual(options);
    });

    it('passes clientOptions to APARTE_CLIENT_OPTIONS, defaulting to {}', async () => {
        vi.spyOn(AparteAiService.prototype, 'connect').mockImplementation(() => undefined);
        const clientOptions = { autoRegister: false, maxTurns: 3 };
        TestBed.configureTestingModule({ providers: [provideAparte({ autoConnect: false, clientOptions })] });
        await TestBed.inject(ApplicationInitStatus).donePromise;

        // This token is how AparteAiService receives the app's client options; a
        // silent drop here would leave a consumer's keyResolver/maxTurns ignored.
        expect(TestBed.inject(APARTE_CLIENT_OPTIONS)).toEqual(clientOptions);
    });

    it('provides an empty client-options object when none are given', async () => {
        vi.spyOn(AparteAiService.prototype, 'connect').mockImplementation(() => undefined);
        TestBed.configureTestingModule({ providers: [provideAparte({ autoConnect: false })] });
        await TestBed.inject(ApplicationInitStatus).donePromise;

        expect(TestBed.inject(APARTE_CLIENT_OPTIONS)).toEqual({});
    });
});

describe('ConversationManagerService', () => {
    function service(): ConversationManagerService {
        TestBed.configureTestingModule({});
        return TestBed.inject(ConversationManagerService);
    }

    it('refuses every mutator until init(adapter) is called', async () => {
        const svc = service();

        // Parity note: the other three wrappers throw synchronously here, because
        // their delegates are plain functions. These are `async`, so the same guard
        // surfaces as a rejection — same message, different shape.
        await expect(svc.createNew()).rejects.toThrow(/Not initialised/);
        await expect(svc.delete('x')).rejects.toThrow(/Not initialised/);
        expect(svc.conversations()).toEqual([]);
        expect(svc.activeConversation()).toBeNull();
    });

    it('init() publishes the list through signals and registers the manager globally', async () => {
        const svc = service();

        await svc.init(new MemoryAdapter());
        await svc.createNew('First');

        expect(svc.conversations()).toHaveLength(1);
        expect(svc.activeConversation()?.title).toBe('First');
        expect(AparteConfig.getConversationManager()).not.toBeNull();
    });

    it('splits active from archived, newest first', async () => {
        const svc = service();
        await svc.init(new MemoryAdapter());

        const older = await svc.createNew('Older');
        await svc.createNew('Newer');
        await svc.archive(older.id);

        expect(svc.archivedConversations().map((c) => c.title)).toEqual(['Older']);
        expect(svc.activeConversations().map((c) => c.title)).toEqual(['Newer']);
    });

    it('unsubscribes on destroy', async () => {
        const svc = service();
        await svc.init(new MemoryAdapter());
        const before = svc.conversations().length;

        svc.ngOnDestroy();
        await svc.createNew('After destroy');

        expect(svc.conversations()).toHaveLength(before);
    });
});
