import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { sparkline, sparklinePath } from './sparkline.js';
import { formatDay, formatHour, formatPercent, formatPrice, formatUnit, formatWhen, toDate } from './format.js';
import { safeUrl, num, str, el } from './dom.js';
import { word, languageOf, intlTag } from './strings.js';
import { weatherIcon } from '../weather/icons.js';
import { WEATHER_CONDITIONS } from '../weather/conditions.js';
import { setupWeatherCard } from '../weather/index.js';

afterEach(() => aparteGlobalConfig.reset());

describe('prices and locale tags', () => {
    it('writes a currency Intl cannot name as given, and draws under a tag Intl refuses', () => {
        aparteGlobalConfig.extendLocale({ tag: 'en-US' });
        expect(formatPrice(aparteGlobalConfig, 49, 'kr')).toBe('49 kr');
        expect(formatPrice(aparteGlobalConfig, 49)).toBe('49');
        aparteGlobalConfig.extendLocale({ tag: 'en_US' });
        expect(intlTag(aparteGlobalConfig)).toBe('en-US');
        aparteGlobalConfig.extendLocale({ tag: 'not a tag!' });
        expect(intlTag(aparteGlobalConfig)).toBeUndefined();
        expect(() => formatPrice(aparteGlobalConfig, 1, 'EUR')).not.toThrow();
    });

    it('reads a day alone as that day where the reader is', () => {
        const day = toDate('2026-10-31')!;
        expect([day.getFullYear(), day.getMonth(), day.getDate(), day.getHours()]).toEqual([2026, 9, 31, 0]);
        expect(toDate('2026-02-30')).toBeNull();
    });
});

describe('sparkline', () => {
    it('draws a curve through the values, scaled to the box, with an optional area', () => {
        const { line, points } = sparklinePath([10, 20, 15], { pad: 0 });
        expect(line.startsWith('M0.00 40.00')).toBe(true);
        expect(points.map((p) => p[1])).toEqual([40, 0, 20]);
        const svg = sparkline([1, 2, 3], { area: true, className: 'x' });
        expect(svg.getAttribute('class')).toContain('x');
        expect(svg.querySelectorAll('path')).toHaveLength(2);
        expect(svg.getAttribute('aria-hidden')).toBe('true');
    });

    it('draws nothing for no number, and a flat line for one', () => {
        expect(sparkline([]).querySelectorAll('path')).toHaveLength(0);
        expect(sparklinePath([5]).points).toEqual([[0, 20], [100, 20]]);
        // A gap is left out rather than written into the path as NaN.
        expect(sparklinePath([1, Number.NaN, 3], { pad: 0 }).line).not.toContain('NaN');
        expect(sparklinePath([1, Number.NaN, 3], { pad: 0 }).points).toEqual([[0, 40], [100, 0]]);
        expect(sparklinePath([1, 9], { range: [0, 10], pad: 0 }).points.map((p) => p[1])).toEqual([36, 4]);
    });
});

describe('formats', () => {
    it("writes days as a person says them, in the locale's language", () => {
        const now = new Date(2026, 10, 3, 12);
        aparteGlobalConfig.extendLocale({ tag: 'en-US' });
        expect(formatDay(aparteGlobalConfig, new Date(2026, 10, 3, 18), 'short', now)).toBe('Today');
        expect(formatDay(aparteGlobalConfig, new Date(2026, 10, 4, 9), 'short', now)).toBe('Tomorrow');
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        expect(formatDay(aparteGlobalConfig, new Date(2026, 10, 4, 9), 'short', now)).toBe('Demain');
        expect(formatDay(aparteGlobalConfig, new Date(2026, 10, 6, 9), 'long', now)).toBe('Vendredi');
        expect(formatPercent(aparteGlobalConfig, 0.4)).toMatch(/^40\s%$/u);
        expect(formatHour(aparteGlobalConfig, new Date(2026, 10, 3, 14))).toMatch(/^14/);
        expect(formatWhen(aparteGlobalConfig, new Date(2026, 10, 3, 14, 5))).toContain('14:05');
    });

    it('keeps a unit Intl does not know', () => {
        expect(formatUnit(aparteGlobalConfig, 12, 'parsec-per-week')).toBe('12 parsec-per-week');
    });

    it('reads dates from ISO strings, epochs in seconds or milliseconds, and nothing else', () => {
        expect(toDate('2026-11-03T10:00:00Z')!.toISOString()).toBe('2026-11-03T10:00:00.000Z');
        expect(toDate(1_793_000_000)!.getTime()).toBe(1_793_000_000_000);
        expect(toDate(1_793_000_000_000)!.getTime()).toBe(1_793_000_000_000);
        expect(toDate('soon')).toBeNull();
        expect(toDate(new Date(NaN))).toBeNull();
        expect(toDate({})).toBeNull();
    });
});

describe('dom', () => {
    it('opens only http(s), mailto and tel links', () => {
        expect(safeUrl('https://example.com/a')).toBe('https://example.com/a');
        expect(safeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
        expect(safeUrl('javascript:alert(1)')).toBeNull();
        expect(safeUrl('data:text/html,x')).toBeNull();
        expect(safeUrl('')).toBeNull();
        expect(safeUrl(42)).toBeNull();
    });

    it('reads numbers and strings the way tools write them', () => {
        expect(num('12.5')).toBe(12.5);
        expect(num('N/A')).toBeUndefined();
        expect(num(Infinity)).toBeUndefined();
        expect(str('  x ')).toBe('x');
        expect(str(3)).toBe('3');
        expect(str('  ')).toBeUndefined();
        expect(el('span', { attrs: { a: true, b: false, c: null } }).outerHTML).toBe('<span a=""></span>');
    });
});

describe('words', () => {
    it("reads the locale's language, falling back to English", () => {
        expect(languageOf(aparteGlobalConfig)).toBe('en');
        aparteGlobalConfig.extendLocale({ tag: 'pt-BR' });
        expect(languageOf(aparteGlobalConfig)).toBe('pt');
        expect(word(aparteGlobalConfig, 'x', { en: 'Hi {name}', pt: 'Olá {name}' }, { name: 'Ana' })).toBe('Olá Ana');
        aparteGlobalConfig.extendLocale({ tag: 'sv-SE' });
        expect(word(aparteGlobalConfig, 'x', { en: 'Hi {name}' })).toBe('Hi {name}');
    });
});

describe('weather glyphs', () => {
    it('has a drawing for every condition, by day and by night', () => {
        for (const condition of WEATHER_CONDITIONS) {
            for (const night of [false, true]) {
                const holder = document.createElement('div');
                holder.innerHTML = weatherIcon(condition, night);
                const svg = holder.querySelector('svg')!;
                expect(svg.getAttribute('data-condition')).toBe(condition);
                expect(svg.children.length).toBeGreaterThan(0);
            }
        }
        expect(weatherIcon('clear', true)).toContain('wx-moon');
        expect(weatherIcon('partly-cloudy', true)).toContain('wx-moon');
    });
});

describe('the next hours', () => {
    it('draws a column per hour under the temperature curve, the first one "Now"', () => {
        // A tag of its own: numbers follow it, and without one they follow the machine's language.
        aparteGlobalConfig.extendLocale({ tag: 'en-US' });
        const stop = setupWeatherCard({ tool: 'get_weather' });
        const renderer = aparteGlobalConfig.getToolRenderer('get_weather')!;
        const hourly = [8, 9, 11, 12].map((t, i) => ({ time: new Date(2026, 10, 3, 9 + i), temperature: t, precipitation: i === 3 ? 60 : 0 }));
        const card = renderer.render({
            id: 's', type: 'tool_call', status: 'resolved',
            toolCall: { id: 'c', name: 'get_weather', input: {} },
            structuredResult: { temperature: 8, hourly },
        }) as HTMLElement;
        const hours = card.querySelectorAll('.aparte-weather__hour');
        expect(hours).toHaveLength(4);
        expect(hours[0]!.querySelector('.aparte-weather__hour-time')!.textContent).toBe('Now');
        expect(card.querySelector('.aparte-weather__hour-rain')!.textContent).toBe('60%');
        expect(card.querySelector<HTMLElement>('.aparte-weather__hourly')!.style.getPropertyValue('--aparte-weather-hours')).toBe('4');
        expect(card.querySelector('.aparte-rich-card__sparkline-line')).not.toBeNull();
        stop();
    });
});
