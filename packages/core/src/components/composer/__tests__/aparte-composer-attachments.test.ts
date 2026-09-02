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

// jsdom has no createObjectURL; every real browser does, and an image tile needs one.
if (typeof URL.createObjectURL !== 'function') {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:vitest';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
}

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

    it('and gives it a finger-sized box there', () => {
        // 18px is under the WCAG 2.2 SC 2.5.8 floor of 24, and this is the only way to
        // drop a file. 24 is not a new number: it is the box `aparte-btn--sm` already
        // draws, so the fix is to stop out-specifying the recipe on touch.
        const coarse = sheet.slice(sheet.indexOf('@media (pointer: coarse)'));
        const rule = coarse.match(/\.aparte-thumb__remove\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(rule, 'the ✕ keeps its 18px box on a coarse pointer')
            .toMatch(/--aparte-thumb-remove-size:\s*var\(--aparte-btn-size-sm\)/);
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

/*
 * The image tile: ONE control, and it is the image.
 *
 * The tile carried `role="button"` and wrapped the real remove `<button>`, so the
 * strip declared a button inside a button — invalid content for the role, and the
 * outer one computes its name from its contents: a screen reader read the file name
 * from the `title`, again from the `.aparte-thumb__name` overlay, and a third time
 * inside "Remove report.png", then offered a nested control with no way to say which
 * of the two an Enter would reach.
 *
 * The preview control is the picture, which is what it opens. The ✕ sits beside it,
 * not inside it. The sent-message strip in the bubble keeps the role on its tile:
 * there is no ✕ there, so nothing is nested, and its tile IS the whole control.
 */
describe('the image tile as a preview button', () => {
    afterEach(() => { aparteGlobalConfig.reset(); });

    const mountImage = (name = 'report.png') => {
        aparteGlobalConfig.setHostHandlers({ attachmentPreview: true });
        return mount([new File(['x'], name, { type: 'image/png' })]);
    };

    const imageOf = (strip: HTMLElement) =>
        strip.querySelector<HTMLImageElement>('.aparte-thumbnail__image')!;

    it('never nests the ✕ inside a button', () => {
        const { strip } = mountImage();
        expect(
            strip.querySelector('[role="button"] .aparte-thumb__remove'),
            'a button inside a button: neither control has an unambiguous name or action',
        ).toBeNull();
    });

    it('puts the role and the tab stop on the image', () => {
        const { strip } = mountImage();
        const img = imageOf(strip);
        expect(img.getAttribute('role')).toBe('button');
        expect(img.getAttribute('tabindex')).toBe('0');
        expect(strip.querySelector('.aparte-thumb--image')!.hasAttribute('role')).toBe(false);
    });

    it('names it once, with the file name', () => {
        const { strip } = mountImage();
        expect(imageOf(strip).getAttribute('aria-label')).toBe('report.png');
    });

    it('escapes that name ONCE — the trap the ✕ label already documents', () => {
        const name = 'a & b "c".png';
        const { strip } = mountImage(name);
        expect(imageOf(strip).getAttribute('aria-label')).toBe(name);
    });

    it('still opens the preview on Enter, exactly once', () => {
        const { strip } = mountImage();
        const seen: string[] = [];
        strip.addEventListener('aparte-attachment-preview', (e) => {
            seen.push((e as CustomEvent).detail.name);
        });

        imageOf(strip).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        expect(seen).toEqual(['report.png']);
    });

    it('is a picture, not a control, when the app declared no preview', () => {
        const { strip } = mount([new File(['x'], 'report.png', { type: 'image/png' })]);
        expect(imageOf(strip).hasAttribute('role')).toBe(false);
        expect(imageOf(strip).hasAttribute('tabindex')).toBe(false);
    });

    /*
     * The name band is a SIBLING of the image, absolutely positioned over it with a
     * scrim — and `.aparte-thumb:hover` reveals it exactly when the pointer is over the
     * tile, so it is the surface most likely to be under a click. It is roughly half of
     * a 56px composer tile.
     *
     * While the role sat on the TILE a click on the band bubbled up to the control. It
     * sits on the `<img>` now, and the band is not an ancestor of the `<img>` — so the
     * only thing that keeps the band click-through is `pointer-events: none`, which
     * makes the click land on the image underneath. Asserted on the SHEET because jsdom
     * does no hit testing: it dispatches on whatever node the test names, so a jsdom
     * click could never tell the two cases apart.
     *
     * The band is decorative either way — the file name is already the image's
     * `aria-label` and the tile's `title`.
     */
    it('lets a click on the name band through to the image under it', () => {
        const sheet = readAparteStylesheet();
        const rule = sheet.match(/\.aparte-thumb__name\s*\{([^}]*)\}/)?.[1];
        expect(rule, 'no rule for the name band').toBeTruthy();
        expect(
            rule,
            'without it the band eats the click and the preview never opens',
        ).toMatch(/pointer-events:\s*none/);
    });

    it('draws its focus ring inside the tile, which clips', () => {
        // The tile is `overflow: hidden` (it is the frame). An outline drawn outward
        // from the image, which fills the tile edge to edge, would be cropped away.
        const sheet = readAparteStylesheet();
        const rule = sheet.match(
            /\.aparte-thumbnail__image\[role='button'\]:focus-visible\s*\{([^}]*)\}/,
        )?.[1];
        expect(rule, 'no focus-visible rule for the image preview button').toBeTruthy();
        expect(rule).toMatch(/outline:/);
        expect(rule, 'a positive offset is clipped by the tile').toMatch(/outline-offset:\s*calc\(\s*-1/);
    });
});
