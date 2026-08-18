// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { filesToAttachments } from '../files-to-attachments.js';

const file = (name: string, type = 'text/plain', body = 'x') => new File([body], name, { type });

// jsdom implements no object-URL store, so the API has to be installed before it
// can be observed (a plain spyOn fails with "createObjectURL does not exist").
beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
        value: vi.fn(() => 'blob:fake'),
        configurable: true,
        writable: true,
    });
});

afterEach(() => vi.restoreAllMocks());

describe('filesToAttachments', () => {
    it('maps a File to a renderable attachment', () => {
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');

        const [attachment] = filesToAttachments([file('notes.md', 'text/markdown', 'hello')]);

        expect(attachment).toMatchObject({
            name: 'notes.md',
            type: 'text/markdown',
            url: 'blob:fake',
        });
        expect(attachment?.id, 'each attachment needs its own id').toBeTruthy();
        expect(attachment?.size).toBeGreaterThan(0);
    });

    it('keeps the raw File so a storage adapter can persist it', () => {
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
        const f = file('doc.txt');

        const [attachment] = filesToAttachments([f]);

        expect(attachment?.blob).toBe(f);
    });

    it('falls back to a generic MIME type when the browser reports none', () => {
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');

        const [attachment] = filesToAttachments([file('.env', '')]);

        expect(attachment?.type).toBe('application/octet-stream');
    });

    it('gives every file a distinct id', () => {
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');

        const attachments = filesToAttachments([file('a.txt'), file('b.txt')]);

        expect(attachments).toHaveLength(2);
        expect(attachments[0]?.id).not.toBe(attachments[1]?.id);
    });

    it('returns an empty array for no files', () => {
        expect(filesToAttachments([])).toEqual([]);
    });
});
