// @vitest-environment jsdom
/**
 * The testing contract: the hooks an app's end-to-end test may rely on, held in place.
 *
 * An app that tests its chat in a browser (Playwright, Cypress, WebDriver) has to find
 * the field, the Send and Stop button, a message by who wrote it, a reply that is still
 * being written and a turn that failed. Nothing said how, or which of it survives a
 * release, so every selector was read out of the source (#203). The answer is not a
 * `data-testid` on every part: each of these is already what a person or a screen reader
 * reads — a role and a name, a state, a code — so a test that asks for the same things is
 * a test of what the chat promises, and the hooks are the attributes that already exist.
 *
 *   | a test looks for     | the hook                                                    |
 *   | the chat's root      | `[data-aparte-chat]`, on the vanilla `<aparte-chat>` too    |
 *   | the field            | `getByRole('textbox', { name: <the placeholder> })`         |
 *   | Send, Stop, Submit   | `aparte-composer-send[data-act]`: `send`, `stop`, `submit`  |
 *   | a message, by role   | `aparte-chat-bubble[data-role]`: `user`, `assistant`        |
 *   | still being written  | `[aria-busy="true"]` on the message                         |
 *   | a failed turn        | `[data-error-code]` on the error segment                    |
 *
 * Every row below runs on a chat that plays real turns: a real client, and a transport
 * this file holds open, so a state is read while it exists rather than after it ended.
 * The attributes the table names on an element have to be in the manifest, which is what
 * the frozen surface reads: that half is checked on the JSDoc the manifest is generated
 * from (the analyzer reads these tags and nothing else), and `check:frozen-surface` holds
 * the built manifest to it. `e2e/tests/testing-guide.spec.ts` plays the same table
 * against the six example apps, in a browser.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AparteClient, aparteGlobalConfig } from '../index.js';
import type { AparteChat } from '../components/chat/aparte-chat.js';
import type { AparteStreamEvent } from '../types/index.js';
import { coreRoot } from './read-stylesheet.js';

/** One turn on the wire, held open until the test says what the model does next. */
interface Turn {
    say(text: string): void;
    finish(): void;
    fail(message: string): void;
}

let client: AparteClient;
let turns: Turn[];
let chat: AparteChat;

/** The transport answers every request with a stream the test writes to by hand. */
function holdTheWire(): Turn[] {
    const held: Turn[] = [];
    aparteGlobalConfig.setTransport({
        chat: () => new ReadableStream<AparteStreamEvent>({
            start(controller) {
                held.push({
                    say: (text) => controller.enqueue({ type: 'text', delta: text }),
                    finish: () => { controller.enqueue({ type: 'done' }); controller.close(); },
                    fail: (message) => { controller.enqueue({ type: 'error', message }); controller.close(); },
                });
            },
        }),
    } as never);
    return held;
}

beforeEach(() => {
    aparteGlobalConfig.registerAIProvider({
        id: 'mock',
        getMetadata: () => ({ id: 'mock', name: 'Mock' }),
        getModels: () => [{ id: 'm', name: 'M' }],
        chat: async () => '',
    } as never);
    aparteGlobalConfig.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    aparteGlobalConfig.setKeyProvider(() => 'k');
    turns = holdTheWire();
    document.body.innerHTML = '<aparte-chat id="chat" placeholder="Ask me anything"></aparte-chat>';
    chat = document.getElementById('chat') as AparteChat;
    client = new AparteClient();
    client.start();
});

afterEach(() => {
    client.stop();
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

// What a test would write, in the order the table gives it.
const root = (): Element | null => document.querySelector('[data-aparte-chat]');
const field = (): Element | null => chat.querySelector('[role="textbox"]');
const sendHook = (): Element | null => chat.querySelector('aparte-composer-send[data-act]');
const sendButton = (): HTMLButtonElement => chat.querySelector<HTMLButtonElement>('aparte-composer-send button')!;
const messages = (role: string): Element[] => [...chat.querySelectorAll(`aparte-chat-bubble[data-role="${role}"]`)];
const stillWritten = (): Element[] => [...chat.querySelectorAll('aparte-chat-bubble [aria-busy="true"]')];
const act = (): string | null | undefined => sendHook()?.getAttribute('data-act');

/** Type, press Send, and wait until the request is on the wire. */
async function ask(text: string): Promise<Turn> {
    const before = turns.length;
    chat.composer!.setValue(text);
    sendButton().click();
    await vi.waitFor(() => expect(turns, 'the send reached the transport').toHaveLength(before + 1));
    return turns[before]!;
}

describe('the chat root: [data-aparte-chat]', () => {
    it('is on the vanilla <aparte-chat>, as it is on the div a wrapper renders', () => {
        expect(root(), 'a test finds the chat by the same attribute whatever the framework').toBe(chat);
    });
});

describe('the field: a textbox named by the placeholder', () => {
    it('is found by its role, and its accessible name is the placeholder', () => {
        const textbox = field();
        expect(textbox, 'no element with role="textbox"').not.toBeNull();
        expect(textbox!.getAttribute('aria-label')).toBe('Ask me anything');
    });

    it('keeps that name when the placeholder changes', () => {
        chat.setAttribute('placeholder', 'Ask again');
        expect(field()!.getAttribute('aria-label')).toBe('Ask again');
    });
});

describe('Send, Stop and Submit: aparte-composer-send[data-act]', () => {
    it('says "send" at rest, on the element and on the button inside it', () => {
        expect(act()).toBe('send');
        expect(sendButton().getAttribute('data-act')).toBe('send');
    });

    it('says "stop" while a reply streams, and "send" again once it has ended', async () => {
        const turn = await ask('Hello');
        turn.say('Hi');
        await vi.waitFor(() => expect(act(), 'the element says stop').toBe('stop'));
        expect(sendButton().getAttribute('data-act'), 'the button says the same').toBe('stop');

        turn.finish();
        await vi.waitFor(() => expect(act(), 'the element says send again').toBe('send'));
        expect(sendButton().getAttribute('data-act')).toBe('send');
    });

    it('is the button that stops the turn, pressed while it says "stop"', async () => {
        const turn = await ask('Hello');
        turn.say('Hi');
        await vi.waitFor(() => expect(act()).toBe('stop'));

        const stopped = vi.fn();
        chat.addEventListener('aparte-cancel', stopped);
        sendButton().click();
        expect(stopped, 'Stop asked the chat to cancel').toHaveBeenCalledTimes(1);

        // The turn ends on its own: the client cancels the stream, the test does not close it.
        await vi.waitFor(() => expect(act(), 'Send is back').toBe('send'));
        await vi.waitFor(() => expect(stillWritten(), 'and nothing is being written').toHaveLength(0));
        expect(messages('assistant')[0]!.hasAttribute('streaming'), 'and the reply no longer says it is streaming').toBe(false);
    });

    it('says "submit" while a panel asks a question, and "send" again after', () => {
        const composer = chat.composer!;
        composer.showPanel(document.createElement('div'), { submitEnabled: true });
        expect(act()).toBe('submit');
        expect(sendButton().getAttribute('data-act')).toBe('submit');

        composer.hidePanel();
        expect(act()).toBe('send');
    });
});

describe('a message: aparte-chat-bubble[data-role]', () => {
    it('is the person\'s as "user" and the model\'s as "assistant"', async () => {
        const turn = await ask('Hello');
        turn.say('Hi');
        turn.finish();
        await vi.waitFor(() => expect(messages('assistant')).toHaveLength(1));
        expect(messages('user')).toHaveLength(1);
        expect(messages('user')[0]!.textContent).toContain('Hello');
    });
});

describe('still being written: [aria-busy="true"] on the message', () => {
    it('is there while the reply streams, and gone when it has ended', async () => {
        expect(stillWritten(), 'nothing is being written before a send').toHaveLength(0);

        const turn = await ask('Hello');
        turn.say('Hi');
        await vi.waitFor(() => expect(stillWritten(), 'the reply is marked busy').toHaveLength(1));
        expect(messages('assistant')[0]!.contains(stillWritten()[0]!), 'on the reply, not on the person\'s message').toBe(true);

        turn.finish();
        await vi.waitFor(() => expect(stillWritten(), 'the mark goes with the stream').toHaveLength(0));
    });

    it('does not leave a reply that has ended carrying the `streaming` attribute', async () => {
        const turn = await ask('Hello');
        turn.say('Hi');
        await vi.waitFor(() => expect(messages('assistant')[0]!.hasAttribute('streaming'), 'set while it is written').toBe(true));

        turn.finish();
        await vi.waitFor(() => expect(stillWritten()).toHaveLength(0));
        expect(messages('assistant')[0]!.hasAttribute('streaming'), 'a finished reply still said it was streaming').toBe(false);
    });
});

describe('a failed turn: [data-error-code] on the error segment', () => {
    it('marks the reply the turn failed in, with the code the failure carries', async () => {
        const turn = await ask('Hello');
        turn.fail('vendor exploded');

        await vi.waitFor(() => expect(chat.querySelector('[data-error-code]'), 'the failure is drawn').not.toBeNull());
        const failed = chat.querySelector('[data-error-code]')!;
        expect(failed.getAttribute('data-error-code'), 'the code is not empty').toMatch(/\S/);
        expect(messages('assistant')[0]!.contains(failed), 'in the assistant message').toBe(true);

        await vi.waitFor(() => expect(act(), 'a failed turn leaves Send, not Stop').toBe('send'));
        expect(stillWritten(), 'and nothing is being written').toHaveLength(0);
        expect(messages('assistant')[0]!.hasAttribute('streaming'), 'and no message says it is streaming').toBe(false);
    });
});

describe('the manifest is generated with the attributes of the contract: they are declared', () => {
    /** The tag of one `@attr` in a source file's JSDoc: from its name to the next tag. */
    function declared(file: string, name: string): string | null {
        const text = readFileSync(resolve(coreRoot(), 'src', file), 'utf8');
        const tag = new RegExp(`@attr\\s+\\{[^}]*\\}\\s+${name}\\b([\\s\\S]*?)(?=\\n\\s*\\*\\s*@|\\n\\s*\\*/)`).exec(text);
        return tag ? tag[1]! : null;
    }

    it.each([
        ['components/chat/aparte-chat.ts', 'data-aparte-chat'],
        ['components/composer/aparte-composer-send.ts', 'data-act'],
    ])('%s declares %s, and says the element writes it', (file, name) => {
        const tag = declared(file, name);
        expect(tag, `no \`@attr\` for ${name}: the manifest, and the frozen surface, would not have it`).not.toBeNull();
        expect(tag, `${name} is the element's to write`).toMatch(/Read-only/);
    });

    it.each([
        ['components/bubble/aparte-chat-bubble.ts', 'data-role'],
        ['components/bubble/aparte-chat-bubble.ts', 'streaming'],
    ])('%s still declares %s', (file, name) => {
        expect(declared(file, name), `\`@attr ${name}\` left ${file}`).not.toBeNull();
    });
});
