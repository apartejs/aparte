import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfigClass } from '../../config/index.js';

/**
 * AparteClient tests
 *
 * Focus: public API surface — abort(), start/stop lifecycle, maxTurns option,
 * and the aparte:abort window event bridge.
 * Internal _streamLoop is not tested here (needs a full provider mock);
 * integration tests for that live in higher-level packages.
 */

describe('AparteClient', () => {
    let client: AparteClient;

    afterEach(() => {
        client?.stop();
        vi.restoreAllMocks();
    });

    // ─── construction ──────────────────────────────────────────────────────

    describe('constructor', () => {
        it('instantiates with no options', () => {
            client = new AparteClient({ autoRegister: false });
            expect(client).toBeDefined();
        });

        it('accepts maxTurns option without error', () => {
            client = new AparteClient({ autoRegister: false, maxTurns: 5 });
            expect(client).toBeDefined();
        });

        it('accepts targetResolver option without error', () => {
            client = new AparteClient({
                autoRegister: false,
                targetResolver: () => null
            });
            expect(client).toBeDefined();
        });
    });

    // ─── start / stop ──────────────────────────────────────────────────────

    describe('start()', () => {
        it('adds aparte-send listener on window', () => {
            const spy = vi.spyOn(window, 'addEventListener');
            client = new AparteClient({ autoRegister: false });
            client.start();
            const eventNames = spy.mock.calls.map(c => c[0]);
            expect(eventNames).toContain('aparte-send');
        });

        it('adds aparte:abort listener on window', () => {
            const spy = vi.spyOn(window, 'addEventListener');
            client = new AparteClient({ autoRegister: false });
            client.start();
            const eventNames = spy.mock.calls.map(c => c[0]);
            expect(eventNames).toContain('aparte:abort');
        });

        it('is safe to call start() twice (re-registers listener)', () => {
            // AparteClient uses the same _boundHandler reference, so window.addEventListener
            // with the same function reference deduplicates in real browsers.
            // The test simply verifies no error is thrown.
            client = new AparteClient({ autoRegister: false });
            expect(() => {
                client.start();
                client.start();
            }).not.toThrow();
        });
    });

    describe('stop()', () => {
        it('removes aparte-send listener from window', () => {
            const spy = vi.spyOn(window, 'removeEventListener');
            client = new AparteClient({ autoRegister: false });
            client.start();
            client.stop();
            const eventNames = spy.mock.calls.map(c => c[0]);
            expect(eventNames).toContain('aparte-send');
        });

        it('removes aparte:abort listener from window', () => {
            const spy = vi.spyOn(window, 'removeEventListener');
            client = new AparteClient({ autoRegister: false });
            client.start();
            client.stop();
            const eventNames = spy.mock.calls.map(c => c[0]);
            expect(eventNames).toContain('aparte:abort');
        });
    });

    // ─── abort() ───────────────────────────────────────────────────────────

    describe('abort()', () => {
        it('sets internal _isAborted flag to true', () => {
            client = new AparteClient({ autoRegister: false });
            expect((client as any)._isAborted).toBe(false);
            client.abort();
            expect((client as any)._isAborted).toBe(true);
        });

        it('aborts every active tool AbortController', () => {
            client = new AparteClient({ autoRegister: false });
            const c1 = new AbortController();
            const c2 = new AbortController();
            const s1 = vi.spyOn(c1, 'abort');
            const s2 = vi.spyOn(c2, 'abort');

            (client as any)._activeToolControllers.add(c1);
            (client as any)._activeToolControllers.add(c2);

            client.abort();

            expect(s1).toHaveBeenCalledOnce();
            expect(s2).toHaveBeenCalledOnce();
        });

        it('clears _activeToolControllers after abort', () => {
            client = new AparteClient({ autoRegister: false });
            const c1 = new AbortController();
            (client as any)._activeToolControllers.add(c1);

            client.abort();

            expect((client as any)._activeToolControllers.size).toBe(0);
        });

        it('is a no-op when no controllers are active', () => {
            client = new AparteClient({ autoRegister: false });
            expect(() => client.abort()).not.toThrow();
            expect((client as any)._isAborted).toBe(true);
        });
    });

    // ─── aparte:abort window event ───────────────────────────────────────────

    describe('aparte:abort window event', () => {
        it('calls abort() when aparte:abort is dispatched while started', () => {
            client = new AparteClient({ autoRegister: false });
            client.start();
            const spy = vi.spyOn(client, 'abort');

            window.dispatchEvent(new CustomEvent('aparte:abort'));

            expect(spy).toHaveBeenCalledOnce();
        });

        it('does NOT call abort() after stop()', () => {
            client = new AparteClient({ autoRegister: false });
            client.start();
            client.stop();
            const spy = vi.spyOn(client, 'abort');

            window.dispatchEvent(new CustomEvent('aparte:abort'));

            expect(spy).not.toHaveBeenCalled();
        });

        it('does NOT react to aparte:abort before start()', () => {
            client = new AparteClient({ autoRegister: false });
            const spy = vi.spyOn(client, 'abort');

            window.dispatchEvent(new CustomEvent('aparte:abort'));

            expect(spy).not.toHaveBeenCalled();
        });
    });

    // ─── _isAborted reset on new send ─────────────────────────────────────

    describe('_isAborted reset on new aparte-send', () => {
        it('resets _isAborted to false when a new aparte-send event arrives', async () => {
            client = new AparteClient({ autoRegister: false });
            client.start();

            // Pre-set the flag
            (client as any)._isAborted = true;

            // Stub _handleSend so we don't need a real provider
            const stub = vi.spyOn(client as any, '_handleSend').mockResolvedValue(undefined);

            window.dispatchEvent(new CustomEvent('aparte-send', {
                detail: { content: 'hello', timestamp: Date.now() }
            }));

            // Let the microtask queue flush
            await new Promise(r => setTimeout(r, 10));

            expect((client as any)._isAborted).toBe(false);
            stub.mockRestore();
        });
    });

    // ─── agnostic API surface ──────────────────────────────────────────────

    describe('agnostic / no-DOM coupling', () => {
        it('does not reference document or window in constructor when autoRegister is false', () => {
            // AparteClient can be constructed in any environment; the only
            // DOM access happens in start() (window.addEventListener) and
            // _handleSend (document.getElementById). Construction itself is safe.
            const docSpy = vi.spyOn(document, 'getElementById');
            client = new AparteClient({ autoRegister: false });
            expect(docSpy).not.toHaveBeenCalled();
        });

        it('exposes abort() as a plain method (no DOM interaction)', () => {
            client = new AparteClient({ autoRegister: false });
            // abort() only touches internal state + controllers — no DOM.
            const docSpy = vi.spyOn(document, 'getElementById');
            client.abort();
            expect(docSpy).not.toHaveBeenCalled();
        });
    });

    // ─── _buildMessages with AparteContentPart[] ────────────────────────────

    describe('_buildMessages — AparteContentPart[] support', () => {
        it('builds a plain string user message when no parts are passed', () => {
            client = new AparteClient({ autoRegister: false });
            // mock target with no messages
            const target = { getMessages: () => [] };
            const msgs = (client as any)._buildMessages('hello', target) as Array<{ role: string; content: unknown }>;
            const userMsg = msgs.find(m => m.role === 'user');
            expect(userMsg?.content).toBe('hello');
        });

        it('builds a content array when image parts are passed', () => {
            client = new AparteClient({ autoRegister: false });
            const target = { getMessages: () => [] };
            const parts = [{ type: 'image' as const, image: 'data:image/png;base64,abc' }];
            const msgs = (client as any)._buildMessages('describe this', target, parts) as Array<{ role: string; content: unknown }>;
            const userMsg = msgs.find(m => m.role === 'user');
            expect(Array.isArray(userMsg?.content)).toBe(true);
            const content = userMsg!.content as Array<{ type: string }>;
            expect(content[0]).toEqual({ type: 'text', text: 'describe this' });
            expect(content[1]).toEqual({ type: 'image', image: 'data:image/png;base64,abc' });
        });

        it('falls back to plain string when parts array is empty', () => {
            client = new AparteClient({ autoRegister: false });
            const target = { getMessages: () => [] };
            const msgs = (client as any)._buildMessages('no image', target, []) as Array<{ role: string; content: unknown }>;
            const userMsg = msgs.find(m => m.role === 'user');
            expect(userMsg?.content).toBe('no image');
        });
    });

    // ─── _filesToContentParts ─────────────────────────────────────────────

    describe('_filesToContentParts', () => {
        it('converts an image File to an AparteImagePart', async () => {
            client = new AparteClient({ autoRegister: false });
            // Create a minimal fake image File
            const blob = new Blob(['fake-png-data'], { type: 'image/png' });
            const file = new File([blob], 'test.png', { type: 'image/png' });

            const parts = await (client as any)._filesToContentParts([file]);

            expect(parts).toHaveLength(1);
            expect(parts[0].type).toBe('image');
            expect(parts[0].mimeType).toBe('image/png');
            expect(typeof parts[0].image).toBe('string');
            expect(parts[0].image).toMatch(/^data:image\/png;base64,/);
        });

        it('ignores non-image files', async () => {
            client = new AparteClient({ autoRegister: false });
            const pdfBlob = new Blob(['pdf-data'], { type: 'application/pdf' });
            const pdfFile = new File([pdfBlob], 'doc.pdf', { type: 'application/pdf' });

            const parts = await (client as any)._filesToContentParts([pdfFile]);

            expect(parts).toHaveLength(0);
        });

        it('returns empty array for empty input', async () => {
            client = new AparteClient({ autoRegister: false });
            const parts = await (client as any)._filesToContentParts([]);
            expect(parts).toHaveLength(0);
        });

        it('filters non-image files while keeping image files', async () => {
            client = new AparteClient({ autoRegister: false });
            const imgBlob = new Blob(['img-data'], { type: 'image/jpeg' });
            const imgFile = new File([imgBlob], 'photo.jpg', { type: 'image/jpeg' });
            const pdfBlob = new Blob(['pdf-data'], { type: 'application/pdf' });
            const pdfFile = new File([pdfBlob], 'doc.pdf', { type: 'application/pdf' });

            const parts = await (client as any)._filesToContentParts([imgFile, pdfFile]);

            expect(parts).toHaveLength(1);
            expect(parts[0].type).toBe('image');
            expect(parts[0].mimeType).toBe('image/jpeg');
        });
    });

    // ─── aparte:retry / aparte:edit listener registration ─────────────────────

    describe('aparte:retry + aparte:edit listeners', () => {
        it('registers aparte:retry listener on start()', () => {
            const spy = vi.spyOn(window, 'addEventListener');
            client = new AparteClient({ autoRegister: false });
            client.start();
            const names = spy.mock.calls.map(c => c[0]);
            expect(names).toContain('aparte:retry');
        });

        it('registers aparte:edit listener on start()', () => {
            const spy = vi.spyOn(window, 'addEventListener');
            client = new AparteClient({ autoRegister: false });
            client.start();
            const names = spy.mock.calls.map(c => c[0]);
            expect(names).toContain('aparte:edit');
        });

        it('removes aparte:retry listener on stop()', () => {
            const spy = vi.spyOn(window, 'removeEventListener');
            client = new AparteClient({ autoRegister: false });
            client.start();
            client.stop();
            const names = spy.mock.calls.map(c => c[0]);
            expect(names).toContain('aparte:retry');
        });

        it('removes aparte:edit listener on stop()', () => {
            const spy = vi.spyOn(window, 'removeEventListener');
            client = new AparteClient({ autoRegister: false });
            client.start();
            client.stop();
            const names = spy.mock.calls.map(c => c[0]);
            expect(names).toContain('aparte:edit');
        });

        it('does not react to aparte:retry before start()', () => {
            client = new AparteClient({ autoRegister: false });
            const spy = vi.spyOn(client as any, '_handleRetry');
            window.dispatchEvent(new CustomEvent('aparte:retry', { detail: { messageId: 'x' } }));
            expect(spy).not.toHaveBeenCalled();
        });

        it('does not react to aparte:edit before start()', () => {
            client = new AparteClient({ autoRegister: false });
            const spy = vi.spyOn(client as any, '_handleEdit');
            window.dispatchEvent(new CustomEvent('aparte:edit', { detail: { messageId: 'x', content: 'y' } }));
            expect(spy).not.toHaveBeenCalled();
        });

        it('calls _handleRetry when aparte:retry is dispatched while started', async () => {
            client = new AparteClient({ autoRegister: false });
            client.start();
            const spy = vi.spyOn(client as any, '_handleRetry').mockResolvedValue(undefined);
            window.dispatchEvent(new CustomEvent('aparte:retry', { detail: { messageId: 'x' } }));
            // Allow microtask queue to flush
            await Promise.resolve();
            expect(spy).toHaveBeenCalledOnce();
        });

        it('calls _handleEdit when aparte:edit is dispatched while started', async () => {
            client = new AparteClient({ autoRegister: false });
            client.start();
            const spy = vi.spyOn(client as any, '_handleEdit').mockResolvedValue(undefined);
            window.dispatchEvent(new CustomEvent('aparte:edit', { detail: { messageId: 'x', content: 'new text' } }));
            await Promise.resolve();
            expect(spy).toHaveBeenCalledOnce();
        });

        it('does not call _handleRetry after stop()', async () => {
            client = new AparteClient({ autoRegister: false });
            client.start();
            client.stop();
            const spy = vi.spyOn(client as any, '_handleRetry').mockResolvedValue(undefined);
            window.dispatchEvent(new CustomEvent('aparte:retry', { detail: { messageId: 'x' } }));
            await Promise.resolve();
            expect(spy).not.toHaveBeenCalled();
        });
    });

    // ─── _resolveTarget ────────────────────────────────────────────────────

    describe('_resolveTarget()', () => {
        it('returns null when no target is in the DOM and no resolver provided', () => {
            client = new AparteClient({ autoRegister: false });
            const result = (client as any)._resolveTarget(undefined);
            expect(result).toBeNull();
        });

        it('resolves via targetId when element is in the DOM', () => {
            const el = document.createElement('div');
            el.id = 'test-target';
            document.body.appendChild(el);

            client = new AparteClient({ autoRegister: false });
            const result = (client as any)._resolveTarget('test-target');
            expect(result).toBe(el);

            el.remove();
        });

        it('resolves via targetResolver when provided', () => {
            const el = document.createElement('div');
            client = new AparteClient({
                autoRegister: false,
                targetResolver: () => el
            });
            const result = (client as any)._resolveTarget(undefined);
            expect(result).toBe(el);
        });

        it('resolves aparte-chat-viewport via DOM scan fallback', () => {
            // aparte-chat-viewport is not registered as a custom element in JSDOM,
            // but the querySelector still matches on tag name.
            const el = document.createElement('aparte-chat-viewport');
            document.body.appendChild(el);

            client = new AparteClient({ autoRegister: false });
            const result = (client as any)._resolveTarget(undefined);
            expect(result).toBe(el);

            el.remove();
        });
    });

    // ─── scopeToTargetId ──────────────────────────────────────────────────

    describe('scopeToTargetId', () => {
        it('accepts scopeToTargetId option without error', () => {
            client = new AparteClient({ autoRegister: false, scopeToTargetId: 'chat-1' });
            expect(client).toBeDefined();
        });

        it('does NOT call _handleRetry when targetId does not match scope', async () => {
            client = new AparteClient({ autoRegister: false, scopeToTargetId: 'chat-1' });
            client.start();
            const spy = vi.spyOn(client as any, '_handleRetry').mockResolvedValue(undefined);

            window.dispatchEvent(new CustomEvent('aparte:retry', {
                detail: { messageId: 'x', targetId: 'chat-2' }  // different target
            }));
            await Promise.resolve();

            expect(spy).not.toHaveBeenCalled();
        });

        it('DOES call _handleRetry when targetId matches scope', async () => {
            client = new AparteClient({ autoRegister: false, scopeToTargetId: 'chat-1' });
            client.start();
            const spy = vi.spyOn(client as any, '_handleRetry').mockResolvedValue(undefined);

            window.dispatchEvent(new CustomEvent('aparte:retry', {
                detail: { messageId: 'x', targetId: 'chat-1' }  // matches
            }));
            await Promise.resolve();

            expect(spy).toHaveBeenCalledOnce();
        });

        it('does NOT call _handleEdit when targetId does not match scope', async () => {
            client = new AparteClient({ autoRegister: false, scopeToTargetId: 'chat-1' });
            client.start();
            const spy = vi.spyOn(client as any, '_handleEdit').mockResolvedValue(undefined);

            window.dispatchEvent(new CustomEvent('aparte:edit', {
                detail: { messageId: 'x', content: 'new', targetId: 'chat-99' }
            }));
            await Promise.resolve();

            expect(spy).not.toHaveBeenCalled();
        });

        it('DOES call _handleEdit when targetId matches scope', async () => {
            client = new AparteClient({ autoRegister: false, scopeToTargetId: 'chat-1' });
            client.start();
            const spy = vi.spyOn(client as any, '_handleEdit').mockResolvedValue(undefined);

            window.dispatchEvent(new CustomEvent('aparte:edit', {
                detail: { messageId: 'x', content: 'new', targetId: 'chat-1' }
            }));
            await Promise.resolve();

            expect(spy).toHaveBeenCalledOnce();
        });

        it('two scoped clients each only handle their own events', async () => {
            const client1 = new AparteClient({ autoRegister: false, scopeToTargetId: 'chat-A' });
            const client2 = new AparteClient({ autoRegister: false, scopeToTargetId: 'chat-B' });
            client1.start();
            client2.start();

            const spy1 = vi.spyOn(client1 as any, '_handleRetry').mockResolvedValue(undefined);
            const spy2 = vi.spyOn(client2 as any, '_handleRetry').mockResolvedValue(undefined);

            window.dispatchEvent(new CustomEvent('aparte:retry', {
                detail: { messageId: 'x', targetId: 'chat-A' }
            }));
            await Promise.resolve();

            expect(spy1).toHaveBeenCalledOnce();
            expect(spy2).not.toHaveBeenCalled();

            client1.stop();
            client2.stop();
        });

        it('unscoped client handles all events regardless of targetId', async () => {
            client = new AparteClient({ autoRegister: false });  // no scopeToTargetId
            client.start();
            const spy = vi.spyOn(client as any, '_handleRetry').mockResolvedValue(undefined);

            window.dispatchEvent(new CustomEvent('aparte:retry', {
                detail: { messageId: 'x', targetId: 'any-target' }
            }));
            await Promise.resolve();

            expect(spy).toHaveBeenCalledOnce();
        });
    });

    // ─── _handleRetry / _handleEdit behavior ──────────────────────────────
    //
    // These tests exercise the orchestration of the retry/edit handlers up to
    // the streaming layer. AparteConfig has no provider configured in the test
    // env, so the handler returns early at the provider-lookup line — that's
    // intentional: we want to verify the **target-side calls** (addSiblingOf,
    // truncateResponsesAfter, fallback to truncateFrom, updateMessage) without
    // wiring a full streaming mock.

    describe('_handleRetry behavior', () => {
        function makeRetryTarget() {
            const target: any = document.createElement('div');
            target.id = 'retry-target';
            target.getMessages = vi.fn(() => [
                { id: 'u1', role: 'user', content: 'hi', timestamp: 1 },
                { id: 'a1', role: 'assistant', content: 'hello', timestamp: 2 },
            ]);
            target.addSiblingOf = vi.fn((_existingId: string, msg: any) => msg.id);
            target.appendMessage = vi.fn();
            target.updateMessage = vi.fn();
            return target;
        }

        it('calls addSiblingOf on the resolved target with the retried messageId', async () => {
            const target = makeRetryTarget();
            document.body.appendChild(target);

            client = new AparteClient({ autoRegister: false });
            client.start();

            window.dispatchEvent(new CustomEvent('aparte:retry', {
                detail: { messageId: 'a1', targetId: 'retry-target' },
            }));
            await Promise.resolve();
            await Promise.resolve();

            expect(target.addSiblingOf).toHaveBeenCalledOnce();
            const [existingId, newMsg] = target.addSiblingOf.mock.calls[0];
            expect(existingId).toBe('a1');
            expect(newMsg).toMatchObject({ role: 'assistant', status: 'pending' });
            expect(typeof newMsg.id).toBe('string');

            target.remove();
        });

        it('returns early when messageId is missing from event detail', async () => {
            const target = makeRetryTarget();
            document.body.appendChild(target);

            client = new AparteClient({ autoRegister: false });
            client.start();

            window.dispatchEvent(new CustomEvent('aparte:retry', { detail: {} }));
            await Promise.resolve();

            expect(target.addSiblingOf).not.toHaveBeenCalled();
            target.remove();
        });

        it('warns and returns when no target is resolvable', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            client = new AparteClient({ autoRegister: false });
            client.start();

            window.dispatchEvent(new CustomEvent('aparte:retry', {
                detail: { messageId: 'a1', targetId: 'does-not-exist' },
            }));
            await Promise.resolve();

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('aparte:retry'),
            );
        });
    });

    describe('_handleEdit behavior', () => {
        function makeEditTarget(opts: { withTruncateResponsesAfter?: boolean } = {}) {
            const target: any = document.createElement('div');
            target.id = 'edit-target';
            target.getMessages = vi.fn(() => [
                { id: 'u1', role: 'user', content: 'old', timestamp: 1 },
                { id: 'a1', role: 'assistant', content: 'reply', timestamp: 2 },
            ]);
            target.updateMessage = vi.fn();
            target.appendMessage = vi.fn();
            target.truncateFrom = vi.fn();
            if (opts.withTruncateResponsesAfter ?? true) {
                target.truncateResponsesAfter = vi.fn();
            }
            return target;
        }

        it('updates the user message content with the new value', async () => {
            const target = makeEditTarget();
            document.body.appendChild(target);

            client = new AparteClient({ autoRegister: false });
            client.start();

            window.dispatchEvent(new CustomEvent('aparte:edit', {
                detail: { messageId: 'u1', content: 'new question', targetId: 'edit-target' },
            }));
            await Promise.resolve();
            await Promise.resolve();

            expect(target.updateMessage).toHaveBeenCalledWith('u1', { content: 'new question' });
            target.remove();
        });

        it('prefers truncateResponsesAfter when available', async () => {
            const target = makeEditTarget({ withTruncateResponsesAfter: true });
            document.body.appendChild(target);

            client = new AparteClient({ autoRegister: false });
            client.start();

            window.dispatchEvent(new CustomEvent('aparte:edit', {
                detail: { messageId: 'u1', content: 'edited', targetId: 'edit-target' },
            }));
            await Promise.resolve();
            await Promise.resolve();

            expect(target.truncateResponsesAfter).toHaveBeenCalledWith('u1');
            expect(target.truncateFrom).not.toHaveBeenCalled();
            target.remove();
        });

        it('falls back to truncateFrom on the next assistant message when truncateResponsesAfter is absent', async () => {
            const target = makeEditTarget({ withTruncateResponsesAfter: false });
            document.body.appendChild(target);

            client = new AparteClient({ autoRegister: false });
            client.start();

            window.dispatchEvent(new CustomEvent('aparte:edit', {
                detail: { messageId: 'u1', content: 'edited', targetId: 'edit-target' },
            }));
            await Promise.resolve();
            await Promise.resolve();

            expect(target.truncateFrom).toHaveBeenCalledWith('a1');
            target.remove();
        });

        it('returns early when newContent is undefined', async () => {
            const target = makeEditTarget();
            document.body.appendChild(target);

            client = new AparteClient({ autoRegister: false });
            client.start();

            window.dispatchEvent(new CustomEvent('aparte:edit', {
                detail: { messageId: 'u1', targetId: 'edit-target' },
            }));
            await Promise.resolve();

            expect(target.updateMessage).not.toHaveBeenCalled();
            expect(target.truncateResponsesAfter).not.toHaveBeenCalled();
            target.remove();
        });

        it('warns and returns when no target is resolvable', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            client = new AparteClient({ autoRegister: false });
            client.start();

            window.dispatchEvent(new CustomEvent('aparte:edit', {
                detail: { messageId: 'u1', content: 'edited', targetId: 'does-not-exist' },
            }));
            await Promise.resolve();

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('aparte:edit'),
            );
        });
    });

    // ─── HITL decision channel (_awaitToolDecision) ────────────────────────
    //
    // The full agent loop needs a streaming provider mock (out of scope here),
    // but the decision channel itself only touches `document` events + the
    // abort signal, so its new { approved, payload } contract is unit-testable.

    describe('_awaitToolDecision (HITL decision channel)', () => {
        it('resolves { approved, payload } and ignores decisions for other tool ids', async () => {
            client = new AparteClient({ autoRegister: false });
            const ctrl = new AbortController();
            const p = (client as any)._awaitToolDecision('call-1', ctrl.signal) as Promise<{ approved: boolean; payload?: unknown }>;

            // a decision aimed at a different tool call must be ignored
            document.dispatchEvent(new CustomEvent('aparte:tool-decision', { detail: { toolCallId: 'other', approved: true } }));
            document.dispatchEvent(new CustomEvent('aparte:tool-decision', {
                detail: { toolCallId: 'call-1', approved: true, payload: { path: '/edited' } },
            }));

            await expect(p).resolves.toEqual({ approved: true, payload: { path: '/edited' } });
        });

        it('resolves { approved: false } on reject', async () => {
            client = new AparteClient({ autoRegister: false });
            const ctrl = new AbortController();
            const p = (client as any)._awaitToolDecision('call-1', ctrl.signal);
            document.dispatchEvent(new CustomEvent('aparte:tool-decision', { detail: { toolCallId: 'call-1', approved: false } }));
            await expect(p).resolves.toMatchObject({ approved: false });
        });

        it('resolves { approved: false } when the signal aborts', async () => {
            client = new AparteClient({ autoRegister: false });
            const ctrl = new AbortController();
            const p = (client as any)._awaitToolDecision('call-1', ctrl.signal);
            ctrl.abort();
            await expect(p).resolves.toEqual({ approved: false });
        });
    });
});

// ─── API key resolution: keyResolver + AparteConfig fallback ──────────────────
// Regression guard for the disconnected key channel: setKeyProvider() feeds
// AparteConfig.getKey(), which the chat path must consult when no options.keyResolver
// is supplied. Previously the chat only read options.keyResolver, so a key set via
// AparteConfig.setKeyProvider() never reached the provider.
describe('AparteClient — API key resolution', () => {
    let client: AparteClient | undefined;

    afterEach(() => {
        client?.stop();
        client = undefined;
        vi.restoreAllMocks();
    });

    function makeSendTarget(): any {
        const el = document.createElement('div') as any;
        el.appendMessage = vi.fn();
        el.updateMessage = vi.fn();
        el.addSegment = vi.fn();
        return el;
    }

    function makeMockProvider(chat: any): any {
        return {
            id: 'mock',
            getMetadata: () => ({ id: 'mock', name: 'Mock' }),
            getModels: () => [{ id: 'm', name: 'M' }],
            // chat rejects so the stream never runs — we only assert the key it received.
            chat,
        };
    }

    it('falls back to AparteConfig.getKey() when no keyResolver is set', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined); // chat rejects on purpose
        const cfg = new AparteConfigClass();
        const chatSpy = vi.fn().mockRejectedValue(new Error('stop after key check'));
        cfg.registerAIProvider(makeMockProvider(chatSpy));
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setKeyProvider(() => 'sk-from-config');
        const getKeySpy = vi.spyOn(cfg, 'getKey');

        const target = makeSendTarget();
        client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => target });
        client.start();

        window.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'hi' } }));
        await vi.waitFor(() => expect(chatSpy).toHaveBeenCalled());

        expect(getKeySpy).toHaveBeenCalledWith('mock');
        expect(chatSpy.mock.calls[0][1]).toBe('sk-from-config');
    });

    it('prefers options.keyResolver over the AparteConfig key channel', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined); // chat rejects on purpose
        const cfg = new AparteConfigClass();
        const chatSpy = vi.fn().mockRejectedValue(new Error('stop after key check'));
        cfg.registerAIProvider(makeMockProvider(chatSpy));
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setKeyProvider(() => 'sk-from-config');
        const getKeySpy = vi.spyOn(cfg, 'getKey');

        const target = makeSendTarget();
        client = new AparteClient({
            config: cfg,
            autoRegister: false,
            targetResolver: () => target,
            keyResolver: () => 'sk-from-resolver',
        });
        client.start();

        window.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'hi' } }));
        await vi.waitFor(() => expect(chatSpy).toHaveBeenCalled());

        expect(chatSpy.mock.calls[0][1]).toBe('sk-from-resolver');
        expect(getKeySpy).not.toHaveBeenCalled();
    });
});

// ─── compaction selector seam (Lot 2.11) ────────────────────────────────────
// compact() summarizes the *dropped* turns and keeps the rest verbatim. The
// selection is injectable so the compaction badge (apps/home) and the action
// share one budget-aware selection; the default drops the whole history
// (summarize all, replace all — the legacy behaviour).
describe('AparteClient — compaction selector', () => {
    let client: AparteClient | undefined;

    afterEach(() => {
        client?.stop();
        client = undefined;
        vi.restoreAllMocks();
    });

    function makeCompactTarget(messages: any[]): any {
        const el = document.createElement('div') as any;
        el.getMessages = vi.fn(() => messages);
        el.appendMessage = vi.fn();
        return el;
    }

    function makeCapturingConfig(): { cfg: AparteConfigClass; captured: () => any } {
        const cfg = new AparteConfigClass();
        cfg.registerAIProvider({
            id: 'mock',
            getMetadata: () => ({ id: 'mock', name: 'Mock' }),
            getModels: () => [{ id: 'm', name: 'M' }],
            chat: vi.fn(),
        } as any);
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setKeyProvider(() => 'sk-test');
        let req: any;
        cfg.setTransport({ chat: vi.fn(async (_p: any, r: any) => { req = r; return 'SUMMARY'; }) } as any);
        return { cfg, captured: () => req };
    }

    const done = () =>
        new Promise<any>(res =>
            window.addEventListener('aparte:compact-done', (e: any) => res(e.detail), { once: true }),
        );

    it('skips compaction (no provider consulted) when the selector drops nothing', async () => {
        const messages = [
            { id: 'u1', role: 'user', content: 'hi', timestamp: 1, status: 'completed' },
            { id: 'a1', role: 'assistant', content: 'hello', timestamp: 2, status: 'completed' },
        ];
        const target = makeCompactTarget(messages);
        const selector = vi.fn((m: any[]) => ({ keep: m, drop: [] as any[] }));
        const detail = done();

        client = new AparteClient({ autoRegister: false, targetResolver: () => target, compactionSelector: selector });
        await client.compact();

        expect(selector).toHaveBeenCalledWith(messages);
        expect(target.appendMessage).not.toHaveBeenCalled();
        await expect(detail).resolves.toMatchObject({ skipped: true });
    });

    it('summarizes only the dropped turns and re-appends the kept ones verbatim', async () => {
        const oldMsgs = [
            { id: 'u1', role: 'user', content: 'old question', timestamp: 1, status: 'completed' },
            { id: 'a1', role: 'assistant', content: 'old answer', timestamp: 2, status: 'completed' },
        ];
        const recent = [{ id: 'u2', role: 'user', content: 'recent question', timestamp: 3, status: 'completed' }];
        const target = makeCompactTarget([...oldMsgs, ...recent]);
        const { cfg, captured } = makeCapturingConfig();
        const detail = done();

        client = new AparteClient({
            config: cfg,
            autoRegister: false,
            targetResolver: () => target,
            compactionSelector: () => ({ keep: recent, drop: oldMsgs }),
        });
        await client.compact();
        await detail;

        // Only the dropped (old) turns reached the summarizer.
        const sent = JSON.stringify(captured().messages);
        expect(sent).toContain('old question');
        expect(sent).toContain('old answer');
        expect(sent).not.toContain('recent question');

        // Summary appended, then the kept recent turn re-appended verbatim.
        const appended = target.appendMessage.mock.calls.map((c: any[]) => c[0]);
        expect(appended.some((m: any) => typeof m.content === 'string' && m.content.includes('SUMMARY'))).toBe(true);
        expect(appended).toContainEqual(recent[0]);
    });

    it('defaults to summarizing the whole history when no selector is given', async () => {
        const messages = [
            { id: 'u1', role: 'user', content: 'aaa', timestamp: 1, status: 'completed' },
            { id: 'a1', role: 'assistant', content: 'bbb', timestamp: 2, status: 'completed' },
        ];
        const target = makeCompactTarget(messages);
        const { cfg, captured } = makeCapturingConfig();
        const detail = done();

        client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => target });
        await client.compact();
        await detail;

        const sent = JSON.stringify(captured().messages);
        expect(sent).toContain('aaa');
        expect(sent).toContain('bbb');
    });
});
