/**
 * A message the server refused for its size (HTTP 413) says what helps.
 *
 * `codeForStatus` had no case for 413: the error fell back to a failing provider, and the person
 * read "The assistant couldn't answer. Try again in a moment.". Trying again sends the same bytes,
 * refused again. nginx refuses a body over 1 MB by default, PHP one over 8 MB, and a pasted text
 * or an image in base64 gets there quickly.
 */
import { describe, it, expect } from 'vitest';
import { errorSentence } from '../error-sentence.js';
import { AparteError } from '../../types/errors.js';
import { APARTE_DEFAULT_LOCALE } from '../../config/locale.js';

const t = (key: string): string => (APARTE_DEFAULT_LOCALE as unknown as Record<string, string>)[key] ?? key;

describe('a message refused for its size', () => {
    it('has a code of its own, and a sentence that asks for a smaller one, not a retry', () => {
        const code = AparteError.codeForStatus(413);
        expect(code).toBe('USAGE_TOO_LARGE');
        const sentence = errorSentence(code, t as never);
        expect(sentence).toBe('This message is too large to send. Remove a file or send a shorter one.');
        expect(sentence).not.toMatch(/try again/i);
    });
});
