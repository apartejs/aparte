import { describe, it, expect } from 'vitest';
import { DEFAULT_LOCALE, type AparteLocale } from '../locale';

describe('DEFAULT_LOCALE', () => {
    it('should have all required keys', () => {
        expect(DEFAULT_LOCALE.inputPlaceholder).toBeDefined();
        expect(DEFAULT_LOCALE.sendButton).toBeDefined();
        expect(DEFAULT_LOCALE.copy).toBeDefined();
        expect(DEFAULT_LOCALE.copied).toBeDefined();
        expect(DEFAULT_LOCALE.retry).toBeDefined();
        expect(DEFAULT_LOCALE.thinking).toBeDefined();
        expect(DEFAULT_LOCALE.typing).toBeDefined();
        expect(DEFAULT_LOCALE.error).toBeDefined();
        expect(DEFAULT_LOCALE.running).toBeDefined();
        expect(DEFAULT_LOCALE.run).toBeDefined();
        expect(DEFAULT_LOCALE.file).toBeDefined();
    });

    it('should have ltr direction', () => {
        expect(DEFAULT_LOCALE.direction).toBe('ltr');
    });

    it('should have English values', () => {
        expect(DEFAULT_LOCALE.sendButton).toBe('Send');
        expect(DEFAULT_LOCALE.thinking).toBe('Thinking...');
        expect(DEFAULT_LOCALE.inputPlaceholder).toBe('Type a message...');
    });

    it('should be a valid AparteLocale', () => {
        const locale: AparteLocale = DEFAULT_LOCALE;
        expect(locale).toBeDefined();
    });
});
