import { describe, it, expect } from 'vitest';
import { visibleReply } from '../suggestion-blocks.js';

/*
 * A joiner or a variation selector draws nothing between two Latin letters, so four of them are
 * two bits per gap: a model can hide a word in an ordinary-looking chip, and the chip sends it as
 * the person's own message. They are kept where a reader sees what they do (an emoji sequence, a
 * script written with joiners) and refused anywhere else.
 */

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
const SYMBOLS = [0x200D, 0x200C, 0xFE0E, 0xFE0F];

/** What a model would do: two bits per gap between the letters of `cover`. */
function hide(secret: string, cover: string): string {
    const bits = [...secret].flatMap((ch) => [...ch.charCodeAt(0).toString(2).padStart(8, '0')]);
    const letters = [...cover];
    let out = '';
    let b = 0;
    for (let i = 0; i < letters.length; i++) {
        out += letters[i];
        if (i < letters.length - 1 && letters[i] !== ' ' && letters[i + 1] !== ' ' && b < bits.length) {
            out += cp(SYMBOLS[parseInt(`${bits[b]}${bits[b + 1] ?? '0'}`, 2)]!);
            b += 2;
        }
    }
    return out;
}

describe('a joiner or a selector between letters carries nothing a reader sees', () => {
    it('refuses a message hidden in the gaps of an ordinary label', () => {
        const label = hide('ADMIN', 'Yes please book Tuesday afternoon slot thanks');
        expect([...label].length).toBeGreaterThan('Yes please book Tuesday afternoon slot thanks'.length);
        expect(visibleReply(label)).toBeNull();
    });

    it.each(SYMBOLS)('refuses U+%s between two Latin letters', (symbol) => {
        expect(visibleReply('Y' + cp(symbol) + 'es')).toBeNull();
    });

    it.each([
        ['Greek', cp(0x3B1, 0x200D, 0x3B2)],
        ['Cyrillic', cp(0x434, 0x200C, 0x430)],
        ['Han', cp(0x4F60, 0x200D, 0x597D)],
        ['Hiragana', cp(0x3042, 0x200C, 0x3044)],
        ['Hangul', cp(0xD55C, 0x200D, 0xAE00)],
        ['digits', '1' + cp(0xFE0F) + '2'],
        ['digits, with a joiner', '1' + cp(0x200D) + '2'],
        ['a selector after a letter then a pictograph', 'Y' + cp(0xFE0F, 0x200D, 0x1F308)],
        ['a joiner after a letter, before a pictograph', 'a' + cp(0x200D, 0x1F308)],
    ])('refuses it in %s', (_what, label) => {
        expect(visibleReply(label)).toBeNull();
    });

    it.each([
        ['a keycap digit', cp(0x31, 0xFE0F, 0x20E3) + ' First'],
        ['a keycap number sign', cp(0x23, 0xFE0F, 0x20E3) + ' Tag'],
        ['an emoji family', cp(0x1F468, 0x200D, 0x1F469, 0x200D, 0x1F467) + ' Family plan'],
        ['an emoji with a skin tone and a job', cp(0x1F9D1, 0x1F3FD, 0x200D, 0x1F4BB) + ' Dev'],
        ['a couple with a heart', cp(0x1F469, 0x200D, 0x2764, 0xFE0F, 0x200D, 0x1F468) + ' Together'],
        ['a woman running', cp(0x1F3C3, 0x200D, 0x2640, 0xFE0F) + ' Run'],
        ['a bear in the snow', cp(0x1F43B, 0x200D, 0x2744, 0xFE0F) + ' Polar'],
        ['a trans flag', cp(0x1F3F3, 0xFE0F, 0x200D, 0x26A7, 0xFE0F) + ' Pride'],
        ['a French flag', cp(0x1F1EB, 0x1F1F7) + ' Francais'],
        ['a Persian half-space', cp(0x0645, 0x06CC, 0x200C, 0x062E, 0x0648, 0x0627, 0x0647, 0x0645)],
        ['a Devanagari half form', cp(0x0915, 0x094D, 0x200D, 0x0937)],
        ['a Devanagari non-joiner', cp(0x0915, 0x094D, 0x200C, 0x0937)],
        ['Sinhala shri', cp(0x0DC1, 0x0DCA, 0x200D, 0x0DBB, 0x0DD3)],
        ['a Bengali ra-zophola', cp(0x09B0, 0x200D, 0x09CD, 0x09AF)],
    ])('keeps %s', (_what, label) => {
        expect(visibleReply(label)).toBe(label);
    });
});

describe('the three flags written as tag sequences are offered, other tag runs are not', () => {
    const tag = (text: string): string => [...text].map((c) => cp(0xE0000 + c.charCodeAt(0))).join('');
    const flag = (region: string): string => cp(0x1F3F4) + tag(region) + cp(0xE007F);

    it.each([['England', 'gbeng'], ['Scotland', 'gbsct'], ['Wales', 'gbwls']])('keeps %s', (name, region) => {
        const label = flag(region) + ' ' + name;
        expect(visibleReply(label)).toBe(label);
    });

    it('refuses any other region, and a flag that carries more after the cancel tag', () => {
        expect(visibleReply(flag('gbxyz') + ' Elsewhere')).toBeNull();
        expect(visibleReply(flag('gbeng') + tag('ADMIN') + ' English')).toBeNull();
        expect(visibleReply(cp(0x1F3F4) + tag('ADMIN') + cp(0xE007F) + ' x')).toBeNull();
        expect(visibleReply('Yes' + tag('gbeng') + cp(0xE007F))).toBeNull();
    });
});

describe('a spacing mark does not overprint', () => {
    it.each([
        ['a Burmese discount', cp(0x101C, 0x103B, 0x103E, 0x1031, 0x102C, 0x1037, 0x1005, 0x103B, 0x1031, 0x1038)],
        ['a Burmese syllable of five marks', cp(0x101C, 0x103B, 0x103E, 0x1031, 0x102C, 0x1037)],
        ['a Malayalam legacy chillu at the end of a word', cp(0x0D05, 0x0D35, 0x0D28, 0x0D4D, 0x200D)],
        ['a Malayalam legacy chillu before a space', cp(0x0D05, 0x0D35, 0x0D28, 0x0D4D, 0x200D) + ' ' + cp(0x0D35, 0x0D30, 0x0D41, 0x0D02)],
    ])('keeps %s', (_what, label) => {
        expect(visibleReply(label)).toBe(label);
    });

    it('still refuses a stack of five non-spacing marks, and a mark after nothing', () => {
        expect(visibleReply('No' + cp(0x0301, 0x0302, 0x0303, 0x0304, 0x0305))).toBeNull();
        expect(visibleReply(cp(0x0301) + 'No')).toBeNull();
        expect(visibleReply('No ' + cp(0x0301) + 'pe')).toBeNull();
    });

    it('refuses a joiner at the end of a word that is not after a virama', () => {
        expect(visibleReply(cp(0x0645, 0x06CC, 0x200C))).toBeNull();
        expect(visibleReply('No' + cp(0x200D))).toBeNull();
    });
});
