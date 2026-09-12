import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteClient } from '../aparte-client.js';

/**
 * A file aparté cannot inline used to disappear between the chip and the model: the chip
 * stayed on screen, `_filesToContentParts` returned `null` for it, and the model answered
 * as though nothing had been attached. The silence is the defect — the limitation is fine
 * and documented. `AparteFilePart` existed to suggest otherwise; it is gone, and the two
 * providers' unreachable `{ type: 'text', text: '' }` branches with it.
 */
const pdf = (name = 'doc.pdf'): File =>
    new File([new Blob(['%PDF-1.4'], { type: 'application/pdf' })], name, { type: 'application/pdf' });

const partsFor = async (files: File[]): Promise<unknown[]> => {
    const client = new AparteClient({ autoRegister: false });
    return (client as unknown as { _filesToContentParts: (f: File[]) => Promise<unknown[]> })._filesToContentParts(files);
};

afterEach(() => { vi.restoreAllMocks(); });

describe('a binary attachment is announced, not swallowed', () => {
    it('warns once, naming the file and its type, and still sends nothing for it', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        expect(await partsFor([pdf()]), 'the limitation itself does not change').toEqual([]);

        expect(warn, 'the developer hears about it exactly once').toHaveBeenCalledTimes(1);
        const message = String(warn.mock.calls[0]?.[0]);
        expect(message, 'named, so the developer knows which chip lied').toContain('doc.pdf');
        expect(message).toContain('application/pdf');
        expect(message, 'and told what aparté does carry').toContain('images and text files only');
    });

    it('does not repeat itself for the same file', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await partsFor([pdf('report.pdf')]);
        await partsFor([pdf('report.pdf')]);
        expect(warn, 'a warning that repeats every send is a warning that gets muted')
            .toHaveBeenCalledTimes(1);
    });

    it('says nothing for the files it does carry', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const png = new File([new Blob(['x'], { type: 'image/png' })], 'shot.png', { type: 'image/png' });
        const md = new File([new Blob(['# hi'], { type: 'text/markdown' })], 'notes.md', { type: 'text/markdown' });
        expect(await partsFor([png, md])).toHaveLength(2);
        expect(warn).not.toHaveBeenCalled();
    });
});
