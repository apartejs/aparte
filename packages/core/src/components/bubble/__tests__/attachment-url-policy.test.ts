// @vitest-environment jsdom
/**
 * An attachment's `url` reaches an `<img src>`, so it answers to the same policy
 * every other URL core writes does.
 *
 * The tile escaped the value and stopped there, while the sanitizer's own
 * `copyAttributes` refuses `href`/`src` outright when `isSafeUrl` says no. The
 * asymmetry is reachable without a model: `AparteAttachment.url` is documented as
 * "URL or data URI" and a storage adapter re-mints it when a conversation is
 * restored, so the value in hand is the app's, not necessarily the composer's.
 *
 * `blob:` is the shape core itself mints (`filesToAttachments`, and hydration), so
 * it stays — the tile keeps working for the first thing a user does.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import type { AparteAttachment } from '../../../types/index.js';

interface BubbleEl extends HTMLElement {
    setAttachments(attachments: AparteAttachment[]): void;
}

function tileFor(url: string, type = 'image/png'): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('message-id', 'm1');
    el.setAttribute('data-role', 'user');
    document.body.appendChild(el);
    el.setAttachments([{ id: 'a1', name: 'shot.png', type, size: 10, url } as AparteAttachment]);
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('the attachment tile applies core’s URL policy', () => {
    for (const url of [
        'javascript:alert(1)',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'vbscript:msgbox(1)',
    ]) {
        it(`refuses ${url.slice(0, 24)}… — no image, and the URL is nowhere in the DOM`, () => {
            const el = tileFor(url);
            expect(el.querySelector('img')).toBeNull();
            expect(el.innerHTML).not.toContain('javascript:');
            expect(el.innerHTML).not.toContain('text/html');
            expect(el.innerHTML).not.toContain('vbscript:');
            // It is still an attachment the user sent — shown as a file chip.
            expect(el.querySelector('.aparte-thumb--file')).not.toBeNull();
            expect(el.querySelector('.aparte-thumb__name')!.textContent).toBe('shot.png');
        });
    }

    it('keeps the blob: URL core itself mints for a picked file', () => {
        const el = tileFor('blob:http://localhost:3000/8f2c-4a11');
        expect(el.querySelector('img')!.getAttribute('src')).toBe('blob:http://localhost:3000/8f2c-4a11');
    });

    it('keeps an https URL and a data: image', () => {
        expect(tileFor('https://cdn.example/shot.png').querySelector('img')!.getAttribute('src'))
            .toBe('https://cdn.example/shot.png');
        expect(tileFor('data:image/png;base64,iVBORw0KGgo=').querySelector('img')!.getAttribute('src'))
            .toBe('data:image/png;base64,iVBORw0KGgo=');
    });
});
