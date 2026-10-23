/**
 * A role's ink reaches the words, and the assistant's box has a padding of its own.
 *
 * `--aparte-message-content-text-user` coloured the user's box, but the text and the segments
 * inside each paint their own colour, so the token never reached a word: a skin with white
 * words on a blue bubble had to scope `--aparte-content-color` on the message instead. And
 * `--aparte-message-content-padding` pads the user's box only, so a skin giving the assistant a
 * bubble needed a selector for its padding.
 *
 * Both go through tokens, not through heavier rules: a consumer's `.aparte-content { color }`
 * or `.aparte-message-content { padding }` has to keep winning, as it did before.
 *
 * Source-shape half (see read-stylesheet.ts); the computed values are in e2e/tests/theming.spec.ts.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet.js';

describe('a message role', () => {
    const sheet = readAparteStylesheet();
    const blocks = [...sheet.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .map((b) => ({ selector: b[1]!.trim(), body: b[2]! }));
    const declaring = (token: string) =>
        blocks.filter((b) => new RegExp(`${token}\\s*:`).test(b.body)).map((b) => b.selector);

    for (const role of ['user', 'assistant']) {
        it(`hands the ${role}'s token to the words as the message's ink`, () => {
            expect(sheet).toMatch(new RegExp(
                `\\.aparte-message\\[data-role="${role}"\\]\\s*\\{\\s*--aparte-message-ink:\\s*var\\(--aparte-message-content-text-${role}\\);`,
            ));
        });

        it(`leaves the ${role}'s token undeclared on the root and the anchors`, () => {
            // Declared there, it would always be set and the content colour a consumer scopes on
            // one message would never be read. The compaction notice declares it for itself.
            expect(declaring(`--aparte-message-content-text-${role}`)).toEqual(['aparte-chat-bubble[data-kind="compaction"]']);
        });
    }

    it('is read by the text and the segments, at their own weight, falling back to the content colour', () => {
        const reader = /color:\s*var\(--aparte-message-ink, var\(--aparte-content-color\)\);/;
        expect(blocks.find((b) => b.selector === '.aparte-content')?.body).toMatch(reader);
        expect(blocks.find((b) => b.selector === '.aparte-segments')?.body).toMatch(reader);
        // No heavier rule paints the words: a consumer's one-class rule still wins.
        expect(blocks.some((b) => /\.aparte-message\[data-role[^,]*\.aparte-content/.test(b.selector) && /\bcolor\s*:/.test(b.body))).toBe(false);
    });

    it("pads the assistant's box from a token of its own, none by default, at no weight", () => {
        expect(sheet).toMatch(/--aparte-message-content-padding-assistant:\s*0;/);
        expect(declaring('padding').filter((s) => s.includes('data-role="assistant"'))).toEqual([
            ':where(.aparte-message[data-role="assistant"] .aparte-message-content)',
        ]);
    });
});
