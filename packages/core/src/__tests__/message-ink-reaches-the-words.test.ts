/**
 * A role's ink reaches the words, and the assistant's box has a padding of its own.
 *
 * `--aparte-message-content-text-user` coloured the user's box, but the text and the segments
 * inside each paint `--aparte-content-color` themselves, so the token never reached a word: a
 * skin with white words on a blue bubble had to scope `--aparte-content-color` on the message
 * instead. And `--aparte-message-content-padding` pads the user's box only, so a skin giving the
 * assistant a bubble needed a selector for its padding.
 *
 * Source-shape half (see read-stylesheet.ts); the computed colours are in e2e/tests/theming.spec.ts.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet.js';

describe('a message role', () => {
    const sheet = readAparteStylesheet();

    for (const role of ['user', 'assistant']) {
        it(`colours the ${role}'s words, not only the box around them`, () => {
            const rule = new RegExp(
                `\\.aparte-message\\[data-role="${role}"\\] :is\\([^)]*\\.aparte-content[^)]*\\.aparte-segments[^)]*\\)\\s*\\{\\s*color:\\s*var\\(--aparte-message-content-text-${role}, var\\(--aparte-content-color\\)\\);`,
            );
            expect(sheet).toMatch(rule);
        });

        it(`leaves the ${role}'s ink undeclared, so a content colour set below the chat still reaches the words`, () => {
            // Declared on the chat's anchors, the default would be the chat's content colour,
            // resolved there, and a `--aparte-content-color` scoped on one message would be lost.
            expect(sheet).not.toMatch(new RegExp(`--aparte-message-content-text-${role}\\s*:`));
        });
    }

    it("pads the assistant's box from a token of its own, none by default", () => {
        expect(sheet).toMatch(/--aparte-message-content-padding-assistant:\s*0;/);
        expect(sheet).toMatch(
            /\.aparte-message\[data-role="assistant"\] \.aparte-message-content\s*\{\s*padding:\s*var\(--aparte-message-content-padding-assistant\);/,
        );
    });
});
