// @vitest-environment jsdom
/**
 * The ✕ on a pending attachment: reachable, and named in the reader's language.
 *
 * Two defects met on one control, and it is the ONLY way to drop a file that was
 * attached by mistake.
 *
 * The first is CSS. `.aparte-thumb__remove` sat at `opacity: 0` with a single
 * `:hover` rule to reveal it, so a keyboard user tabbing onto it got a focus ring
 * drawn around nothing, and a touch user — who cannot hover at all — never saw it.
 * `e2e/tests/attachments.spec.ts` passed the whole time because Playwright's
 * visibility check ignores `opacity`.
 *
 * The second is the label. `aria-label="Remove ${name}"` was a literal, on an
 * icon-only button, so that string is the whole of what a screen-reader user hears
 * there and it stayed English in every locale the library shipped.
 *
 * The CSS assertions read the SHEET (jsdom applies no stylesheet and resolves no
 * `var()`, so a computed opacity here would be meaningless), and the DOM assertions
 * read the element. Both halves are needed: the control has to be focusable for
 * `:focus-within` to ever match, so a future "just make it tabindex=-1" cannot satisfy
 * the CSS half alone.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-attachments.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import { APARTE_DEFAULT_LOCALE } from '../../../config/locale.js';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';

type ComposerWithAttachments = HTMLElement & { addAttachments(files: File[] | FileList): void };

function mount(files: File[]) {
    const composer = document.createElement('aparte-composer') as ComposerWithAttachments;
    document.body.appendChild(composer);
    const strip = document.createElement('aparte-composer-attachments');
    composer.appendChild(strip);
    composer.addAttachments(files);
    return { composer, strip };
}

const removeButtons = (strip: HTMLElement) =>
    [...strip.querySelectorAll<HTMLButtonElement>('.aparte-thumb__remove')];

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.resetLocale();
});

describe('the pending attachment ✕ — the sheet', () => {
    const sheet = readAparteStylesheet();

    it('reveals it on focus as well as on hover', () => {
        // Both selectors in one rule, the pair `bubble.css` and `conversation.css`
        // already use. The hover half alone is what shipped.
        const rule = sheet.match(
            /\.aparte-thumb:hover \.aparte-thumb__remove,\s*\n\s*\.aparte-thumb:focus-within \.aparte-thumb__remove\s*\{([^}]*)\}/,
        )?.[1];
        expect(rule, 'no combined hover/focus-within rule for .aparte-thumb__remove').toBeTruthy();
        expect(rule).toMatch(/opacity:\s*1/);
    });

    it('shows it outright where there is no hover to give', () => {
        const coarse = sheet.slice(sheet.indexOf('@media (pointer: coarse)'));
        const rule = coarse.match(/\.aparte-thumb__remove\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(rule, 'the ✕ is not revealed in the coarse-pointer block').toMatch(/opacity:\s*1/);
    });
});

describe('the pending attachment ✕ — the control', () => {
    it('is a real button, so :focus-within can ever match', () => {
        const { strip } = mount([new File(['x'], 'rapport.pdf', { type: 'application/pdf' })]);
        const [button] = removeButtons(strip);
        expect(button).toBeTruthy();
        expect(button!.tagName).toBe('BUTTON');
        expect(button!.type).toBe('button');
        // Not `tabindex="-1"`: a control the CSS reveals on focus has to be reachable
        // by focus in the first place. A default <button> is; this pins it.
        expect(button!.hasAttribute('tabindex')).toBe(false);
    });

    it('carries a name, since it has no visible text', () => {
        const { strip } = mount([new File(['x'], 'rapport.pdf', { type: 'application/pdf' })]);
        expect(removeButtons(strip)[0]!.getAttribute('aria-label')).toBe('Remove rapport.pdf');
    });

    it('takes that name from the locale', () => {
        aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, removeAttachment: 'Supprimer {name}' });
        const { strip } = mount([new File(['x'], 'rapport.pdf', { type: 'application/pdf' })]);
        expect(removeButtons(strip)[0]!.getAttribute('aria-label')).toBe('Supprimer rapport.pdf');
    });

    it('escapes the file name ONCE — a & is an &, not an &amp;', () => {
        // The label is built from the RAW name and escaped at the end. Reusing the
        // already-escaped name (which the tile's title and alt use) would escape twice
        // and the reader would hear "rapport &amp;quot; co".
        const name = 'a & b "c".pdf';
        const { strip } = mount([new File(['x'], name, { type: 'application/pdf' })]);
        expect(removeButtons(strip)[0]!.getAttribute('aria-label')).toBe(`Remove ${name}`);
    });

    it('names each file, one button per tile', () => {
        const { strip } = mount([
            new File(['x'], 'one.pdf', { type: 'application/pdf' }),
            new File(['y'], 'two.txt', { type: 'text/plain' }),
        ]);
        expect(removeButtons(strip).map((b) => b.getAttribute('aria-label')))
            .toEqual(['Remove one.pdf', 'Remove two.txt']);
    });
});
