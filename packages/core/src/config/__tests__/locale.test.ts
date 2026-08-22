import { describe, it, expect } from 'vitest';
import { APARTE_DEFAULT_LOCALE, type AparteLocale } from '../locale';

describe('APARTE_DEFAULT_LOCALE', () => {
    it('should have all required keys', () => {
        expect(APARTE_DEFAULT_LOCALE.inputPlaceholder).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.sendButton).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.copy).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.copied).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.retry).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.thinking).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.typing).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.error).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.running).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.run).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.file).toBeDefined();
    });

    it('should have ltr direction', () => {
        expect(APARTE_DEFAULT_LOCALE.direction).toBe('ltr');
    });

    it('should have English values', () => {
        expect(APARTE_DEFAULT_LOCALE.sendButton).toBe('Send');
        expect(APARTE_DEFAULT_LOCALE.thinking).toBe('Thinking...');
        expect(APARTE_DEFAULT_LOCALE.inputPlaceholder).toBe('Type a message...');
    });

    it('should be a valid AparteLocale', () => {
        const locale: AparteLocale = APARTE_DEFAULT_LOCALE;
        expect(locale).toBeDefined();
    });
});
