// @vitest-environment jsdom
/**
 * Two chats on one page, one of them unnamed: a compaction event is `window`-wide, and a
 * watcher must act only on events about a message of ITS transcript.
 *
 * An unnamed chat is addressed by events with no id, and a named one accepts those too (the
 * library's broadcast convention), so the id alone cannot tell the two apart. What does is the
 * message the event names: it is in one chat's transcript and not in the other's.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CheckpointStateWatcher } from '../checkpoint-state.js';

interface Chat { watcher: CheckpointStateWatcher; bubbles: Map<string, HTMLElement>; stop: () => void }

/** A chat with these message ids in its transcript and a bubble drawn for each. */
function chat(ownId: string | undefined, ids: string[]): Chat {
    const bubbles = new Map(ids.map((id) => [id, document.createElement('div')] as const));
    const watcher = new CheckpointStateWatcher({
        ownId: () => ownId,
        bubbleOf: (id) => bubbles.get(id) ?? null,
        owns: (id) => bubbles.has(id),
    });
    return { watcher, bubbles, stop: watcher.start() };
}

const emit = (name: 'start' | 'done' | 'error', detail: Record<string, unknown>): void => {
    window.dispatchEvent(new CustomEvent(`aparte-compact-${name}`, { detail }));
};
const state = (c: Chat, id: string): string | null => c.bubbles.get(id)!.getAttribute('data-checkpoint');

describe('a checkpoint watcher with two chats on the page', () => {
    let named: Chat;
    let unnamed: Chat;
    beforeEach(() => {
        named = chat('b', ['b-user', 'b-user-2']);
        unnamed = chat(undefined, ['a-user', 'a-user-2']);
    });
    afterEach(() => { named.stop(); unnamed.stop(); });

    it('keeps a named chat\'s failed line when the unnamed chat starts compacting', () => {
        emit('error', { targetId: 'b', messageId: 'b-user', error: 'boom' });
        expect(state(named, 'b-user')).toBe('failed');

        // The plugin names no chat for an unnamed one: the event reaches the named watcher too.
        emit('start', { messageId: 'a-user' });

        expect(state(named, 'b-user'), 'not this chat\'s message: nothing is cleared').toBe('failed');
        expect(state(unnamed, 'a-user')).toBe('pending');
    });

    it('keeps the unnamed chat\'s failed line when the named chat starts compacting', () => {
        emit('error', { messageId: 'a-user', error: 'boom' });
        expect(state(unnamed, 'a-user')).toBe('failed');

        emit('start', { targetId: 'b', messageId: 'b-user' });

        expect(state(unnamed, 'a-user'), 'a named event is not for an unnamed chat').toBe('failed');
        expect(state(named, 'b-user')).toBe('pending');
    });

    it('keeps a pending line when an untargeted error names a message of the other chat', () => {
        emit('start', { targetId: 'b', messageId: 'b-user' });
        expect(state(named, 'b-user')).toBe('pending');

        emit('error', { messageId: 'a-user', error: 'boom' });

        expect(state(named, 'b-user')).toBe('pending');
        expect(state(unnamed, 'a-user')).toBe('failed');
    });

    it('still moves its own state on to the next message of its own chat', () => {
        emit('start', { targetId: 'b', messageId: 'b-user' });
        emit('start', { targetId: 'b', messageId: 'b-user-2' });
        expect(state(named, 'b-user'), 'the earlier line is taken off').toBeNull();
        expect(state(named, 'b-user-2')).toBe('pending');
    });

    it('ignores a start that names no message', () => {
        emit('start', { targetId: 'b', messageId: 'b-user' });
        emit('start', { targetId: 'b' });
        expect(state(named, 'b-user')).toBe('pending');
    });
});
