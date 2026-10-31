import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, getSegmentRenderer, type AparteToolCallSegment } from '@aparte/core';
import {
    setupWeatherCard,
    weatherCard,
    readWeather,
    fromOpenMeteo,
    conditionFromWmo,
    conditionFromOpenWeather,
    conditionFromText,
} from './index.js';
import { existsSync, readFileSync } from 'node:fs';

const LILLE = {
    city: 'Lille', condition: 'partly-cloudy', temperature: 11.4, feelsLike: 9, high: 14, low: 7, humidity: 78,
    wind: { speed: 18, unit: 'km/h', direction: 240 }, precipitation: 40,
};

let stop: () => void = () => {};
afterEach(() => {
    stop();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

function call(status: AparteToolCallSegment['status'], result?: unknown, input: Record<string, unknown> = { city: 'Lille' }): AparteToolCallSegment {
    return {
        id: 's1', type: 'tool_call', status,
        toolCall: { id: 'c1', name: 'get_weather', input },
        ...(result !== undefined ? { structuredResult: result, result: JSON.stringify(result) } : {}),
    };
}

function draw(segment: AparteToolCallSegment): HTMLElement {
    const renderer = aparteGlobalConfig.getToolRenderer('get_weather')!;
    const out = renderer.render(segment);
    expect(out).toBeInstanceOf(HTMLElement);
    document.body.append(out as HTMLElement);
    return out as HTMLElement;
}

describe('the weather card on a tool', () => {
    beforeEach(() => {
        stop = setupWeatherCard({ tool: 'get_weather', map: (r) => ({ ...r, location: r.city }) });
    });

    it('draws the result in its default variant, with the place, the temperature and the stats', () => {
        const card = draw(call('resolved', LILLE));
        expect(card.dataset.card).toBe('weather');
        expect(card.dataset.variant).toBe('hero');
        expect(card.dataset.state).toBe('ready');
        expect(card.getAttribute('aria-label')).toBe('Weather in Lille');
        expect(card.querySelector('.aparte-weather__location')!.textContent).toBe('Lille');
        expect(card.querySelector('.aparte-weather__temp')!.textContent).toBe('11°');
        expect(card.querySelector('.aparte-weather__summary')!.textContent).toBe('Partly cloudy');
        const stats = [...card.querySelectorAll('.aparte-weather__stat-label')].map((n) => n.textContent);
        expect(stats).toEqual(['Wind', 'Humidity', 'Rain']);
        expect(card.querySelector('.aparte-weather__sky')!.getAttribute('data-condition')).toBe('partly-cloudy');
    });

    it('shows a skeleton with what the input already says while the call runs', () => {
        const card = draw(call('pending', undefined, { city: 'Lyon' }));
        expect(card.dataset.state).toBe('loading');
        expect(card.getAttribute('aria-busy')).toBe('true');
        expect(card.querySelector('.aparte-weather__location')!.textContent).toBe('Lyon');
        expect(card.querySelectorAll('.aparte-skeleton').length).toBeGreaterThan(2);
    });

    it('shrinks to one line, never a card, when the call waited, was refused or failed', () => {
        expect(draw(call('awaiting-approval')).textContent).toContain('Waiting for your approval');
        expect(draw(call('rejected')).textContent).toContain('Not run');
        const failed = draw(call('failed'));
        expect(failed.dataset.state).toBe('unavailable');
        expect(failed.querySelector('.aparte-weather__temp')).toBeNull();
    });

    it('says it is unavailable, and warns once, when map gives nothing it can draw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const card = draw(call('resolved', { nothing: true }));
        draw(call('resolved', { nothing: true }));
        expect(card.dataset.state).toBe('unavailable');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('patches the same element when the result lands', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('get_weather')!;
        const card = draw(call('pending'));
        renderer.update!(card, call('resolved', LILLE));
        expect(card.dataset.state).toBe('ready');
        expect(card.hasAttribute('aria-busy')).toBe(false);
        expect(card.querySelector('.aparte-weather__temp')!.textContent).toBe('11°');
    });

    it('relabels in place on a language switch, adding no node', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('get_weather')!;
        const card = draw(call('resolved', LILLE));
        const count = card.querySelectorAll('*').length;
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        renderer.relabel!(card, call('resolved', LILLE));
        expect(card.querySelectorAll('*').length).toBe(count);
        expect(card.querySelector('.aparte-weather__summary')!.textContent).toBe('Partiellement nuageux');
        expect(card.getAttribute('aria-label')).toBe('Météo à Lille');
        expect([...card.querySelectorAll('.aparte-weather__stat-label')].map((n) => n.textContent)).toEqual(['Vent', 'Humidité', 'Pluie']);
    });

    it("takes the app's own word over the package's", () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR', cardsWeatherWind: 'Rafales' });
        const card = draw(call('resolved', LILLE));
        expect(card.querySelector('.aparte-weather__stat-label')!.textContent).toBe('Rafales');
    });

    it('never parses a value from the tool as markup', () => {
        const card = draw(call('resolved', { ...LILLE, city: '<img src=x onerror="window.__pwned=1">' }));
        expect(card.querySelector('img')).toBeNull();
        expect(card.querySelector('.aparte-weather__location')!.textContent).toContain('<img');
    });
});

describe('variants', () => {
    it('picks a variant per result, and reads an unknown name as the default', () => {
        stop = setupWeatherCard({ tool: 'get_weather', map: (r) => r, variant: (d) => (d.daily.length ? 'forecast' : 'compact') });
        expect(draw(call('resolved', LILLE)).dataset.variant).toBe('compact');
        const days = [{ date: '2026-11-01', high: 14, low: 7 }, { date: '2026-11-02', high: 12, low: 6, condition: 'rain', precipitation: 70 }];
        const forecast = draw(call('resolved', { ...LILLE, daily: days }));
        expect(forecast.dataset.variant).toBe('forecast');
        expect(forecast.querySelectorAll('.aparte-weather__day')).toHaveLength(2);
        stop();
        stop = setupWeatherCard({ tool: 'get_weather', variant: 'nope' as never });
        expect(draw(call('resolved', LILLE)).dataset.variant).toBe('hero');
    });

    it('lays the forecast range bars out on one shared scale', () => {
        stop = setupWeatherCard({ tool: 'get_weather', variant: 'forecast' });
        const card = draw(call('resolved', {
            temperature: 10,
            daily: [{ date: '2026-11-01', high: 20, low: 10 }, { date: '2026-11-02', high: 30, low: 20 }],
        }));
        const fills = [...card.querySelectorAll<HTMLElement>('.aparte-weather__bar-fill')];
        expect(fills[0]!.style.getPropertyValue('--aparte-weather-bar-start')).toBe('0%');
        expect(fills[0]!.style.getPropertyValue('--aparte-weather-bar-end')).toBe('50%');
        expect(fills[1]!.style.getPropertyValue('--aparte-weather-bar-start')).toBe('50%');
        expect(card.querySelector('.aparte-weather__bar-now')).not.toBeNull();
    });
});

describe('the weather card as a segment', () => {
    it('draws a card segment, and its fallback sentence says the same', () => {
        stop = setupWeatherCard();
        const segment = weatherCard.segment({ ...LILLE, location: 'Lille' }, { variant: 'compact' });
        // `Intl` writes the unit; whether a (narrow) space goes before it depends on the ICU data.
        expect(segment.fallback).toMatch(/^Lille: 11\s?°C, Partly cloudy, High 14\s?°C \/ Low 7\s?°C$/u);
        const out = getSegmentRenderer('card')!.render(segment as never) as HTMLElement;
        expect(out.dataset.variant).toBe('compact');
        expect(out.querySelector('.aparte-weather__temp')!.textContent).toBe('11°');
    });

    it('writes the fallback sentence of a card no page set up', () => {
        stop = setupWeatherCard();
        const out = getSegmentRenderer('card')!.render({ id: 'x', type: 'card', card: 'stock', data: {}, fallback: 'AAPL 182' } as never) as HTMLElement;
        expect(out.textContent).toBe('AAPL 182');
    });

    it('stops drawing card segments once the last card is unplugged', () => {
        const off = setupWeatherCard();
        expect(getSegmentRenderer('card')).toBeTruthy();
        off();
        expect(getSegmentRenderer('card')?.type).not.toBe('card');
    });
});

describe('actions', () => {
    it('draws at most three, skips a link that is not http(s), and lets the app cancel', () => {
        stop = setupWeatherCard({
            tool: 'get_weather',
            actions: () => [
                { label: 'Bad', url: 'javascript:alert(1)' },
                { label: 'Hourly', send: 'Hourly please' },
                { label: 'Site', url: 'https://example.com' },
                { label: 'Track', id: 'track' },
                { label: 'Fourth', id: 'four' },
            ],
        });
        const card = draw(call('resolved', LILLE));
        const labels = [...card.querySelectorAll('.aparte-rich-card__action')].map((b) => b.textContent);
        expect(labels).toEqual(['Hourly', 'Site', 'Track']);
        const seen: unknown[] = [];
        document.addEventListener('aparte-card-action', (e) => { seen.push((e as CustomEvent).detail.action.label); e.preventDefault(); }, { once: true });
        (card.querySelector('.aparte-rich-card__action') as HTMLButtonElement).click();
        expect(seen).toEqual(['Hourly']);
    });

    it('sends through the chat composer', () => {
        stop = setupWeatherCard({ tool: 'get_weather', actions: () => [{ label: 'Hourly', send: 'Hourly please' }] });
        const composer = document.createElement('aparte-composer') as HTMLElement & { setValue: (v: string) => void; submit: () => void };
        const sent: string[] = [];
        composer.setValue = (v) => sent.push(v);
        composer.submit = () => sent.push('<submit>');
        document.body.append(composer);
        (draw(call('resolved', LILLE)).querySelector('.aparte-rich-card__action') as HTMLButtonElement).click();
        expect(sent).toEqual(['Hourly please', '<submit>']);
    });

    it("sends through the composer of the card's own chat, in a wrapper's shape too, and keeps the draft", () => {
        stop = setupWeatherCard({ tool: 'get_weather', actions: () => [{ label: 'Hourly', send: 'Hourly please' }] });
        const sent: string[] = [];
        // Two chats as the React, Vue and Svelte wrappers draw them: `<div data-aparte-chat>`.
        const chat = (name: string, draft: string) => {
            const host = document.createElement('div');
            host.setAttribute('data-aparte-chat', '');
            const composer = document.createElement('aparte-composer');
            let value = draft;
            Object.defineProperties(composer, {
                value: { get: () => value, configurable: true },
                streaming: { value: false, writable: true, configurable: true },
                panelActive: { value: false, configurable: true },
                setValue: { value: (v: string) => { value = v; sent.push(`${name}:${v}`); } },
                submit: { value: () => sent.push(`${name}:<submit>`) },
            });
            host.append(composer);
            document.body.append(host);
            return { host, composer: composer as HTMLElement & { streaming: boolean } };
        };
        chat('first', '');
        const second = chat('second', 'half a thought');
        const card = draw(call('resolved', LILLE));
        second.host.append(card);
        (card.querySelector('.aparte-rich-card__action') as HTMLButtonElement).click();
        expect(sent).toEqual(['second:Hourly please', 'second:<submit>', 'second:half a thought']);

        // A reply streaming: the button must not stop it.
        sent.length = 0;
        second.composer.streaming = true;
        (card.querySelector('.aparte-rich-card__action') as HTMLButtonElement).click();
        expect(sent).toEqual([]);
    });
});

describe('reading the data', () => {
    it('reads the shapes tools return', () => {
        const d = readWeather({ temp: '12', unit: '°F', windSpeed: 10, windUnit: 'mph', humidity: 0.55, is_day: 0, summary: 'Light rain' })!;
        expect(d.temperature).toBe(12);
        expect(d.unit).toBe('F');
        expect(d.wind).toEqual({ speed: 10, unit: 'mph', direction: undefined });
        expect(d.humidity).toBe(55);
        expect(d.night).toBe(true);
        expect(d.condition).toBe('rain');
        expect(readWeather({ location: 'Nowhere' })).toBeNull();
        expect(readWeather(null)).toBeNull();
    });

    it('maps the codes of the usual APIs', () => {
        expect(conditionFromWmo(0)).toBe('clear');
        expect(conditionFromWmo(2)).toBe('partly-cloudy');
        expect(conditionFromWmo(45)).toBe('fog');
        expect(conditionFromWmo(65)).toBe('heavy-rain');
        expect(conditionFromWmo(75)).toBe('snow');
        expect(conditionFromWmo(99)).toBe('thunder');
        expect(conditionFromWmo(1000)).toBeUndefined();
        expect(conditionFromOpenWeather(211)).toBe('thunder');
        expect(conditionFromOpenWeather(502)).toBe('heavy-rain');
        expect(conditionFromOpenWeather(611)).toBe('sleet');
        expect(conditionFromOpenWeather(741)).toBe('fog');
        expect(conditionFromOpenWeather(804)).toBe('cloudy');
        expect(conditionFromText('Partiellement nuageux')).toBe('partly-cloudy');
        expect(conditionFromText('Thunderstorm with hail')).toBe('thunder');
        expect(conditionFromText('heavy-rain')).toBe('heavy-rain');
        expect(conditionFromText('')).toBeUndefined();
    });

    it("reads an Open-Meteo response, keeping the hours from now on", () => {
        const input = fromOpenMeteo({
            current: { time: '2026-11-03T14:00', temperature_2m: 21.4, apparent_temperature: 22, relative_humidity_2m: 55, is_day: 0, weather_code: 3, wind_speed_10m: 9, wind_direction_10m: 120 },
            current_units: { temperature_2m: '°F', wind_speed_10m: 'mp/h' },
            hourly: { time: ['2026-11-03T12:00', '2026-11-03T14:00', '2026-11-03T15:00'], temperature_2m: [20, 21, 22], weather_code: [3, 3, 61], precipitation_probability: [0, 10, 60] },
            daily: { time: ['2026-11-03'], weather_code: [61], temperature_2m_max: [23], temperature_2m_min: [15], precipitation_probability_max: [70] },
        }, { location: 'Sevilla' });
        const d = readWeather(input)!;
        expect(d.location).toBe('Sevilla');
        expect(d.condition).toBe('cloudy');
        expect(d.unit).toBe('F');
        expect(d.night).toBe(true);
        expect(d.wind?.unit).toBe('mph');
        expect(d.hourly.map((h) => h.temperature)).toEqual([21, 22]);
        expect(d.daily[0]).toMatchObject({ high: 23, low: 15, condition: 'rain', precipitation: 70 });
        expect(d.high).toBe(23);
    });
});

describe('Open-Meteo, read as it is sent', () => {
    const hours = (offset: number | undefined) => readWeather(fromOpenMeteo({
        ...(offset !== undefined ? { utc_offset_seconds: offset } : {}),
        current: { time: '2026-11-03T14:00', temperature_2m: 12, weather_code: 3 },
        hourly: { time: ['2026-11-03T14:00', '2026-11-03T15:00'], temperature_2m: [12, 13] },
    }))!;

    it("reads its times on the response's own offset, so they are real instants", () => {
        // GMT, Open-Meteo's default: 14:00 is 14:00 UTC, whatever the reader's zone.
        expect(hours(0).time!.toISOString()).toBe('2026-11-03T14:00:00.000Z');
        expect(hours(0).hourly[0]!.time.toISOString()).toBe('2026-11-03T14:00:00.000Z');
        // `timezone=Asia/Tokyo` (UTC+9): 14:00 there is 05:00 UTC.
        expect(hours(32_400).time!.toISOString()).toBe('2026-11-03T05:00:00.000Z');
        expect(hours(32_400).hourly.map((h) => h.time.toISOString())).toEqual(['2026-11-03T05:00:00.000Z', '2026-11-03T06:00:00.000Z']);
        // An epoch (`timeformat=unixtime`) is already an instant: the offset is not taken twice.
        const unix = readWeather(fromOpenMeteo({ utc_offset_seconds: 32_400, current: { time: 1_793_721_600, temperature_2m: 12 } }))!;
        expect(unix.time!.getTime()).toBe(1_793_721_600_000);
    });

    it('takes the temperature and wind units from whichever block the response has', () => {
        const daily = fromOpenMeteo({
            daily_units: { temperature_2m_max: '°F' },
            daily: { time: ['2026-11-03'], temperature_2m_max: [60], temperature_2m_min: [45] },
        });
        expect(daily.unit).toBe('F');
        const legacy = fromOpenMeteo({
            current_weather: { time: '2026-11-03T14:00', temperature: 60, windspeed: 9, weathercode: 3 },
            current_weather_units: { temperature: '°F', windspeed: 'mp/h' },
        });
        expect(legacy.unit).toBe('F');
        expect(legacy.wind).toMatchObject({ speed: 9, unit: 'mph' });
        const hourly = fromOpenMeteo({
            current: { time: '2026-11-03T14:00', temperature_2m: 60, wind_speed_10m: 9 },
            hourly_units: { temperature_2m: '°F', wind_speed_10m: 'mp/h' },
            hourly: { time: ['2026-11-03T14:00'], temperature_2m: [60] },
        });
        expect(hourly.unit).toBe('F');
        expect(hourly.wind).toMatchObject({ unit: 'mph' });
    });
});

describe('reading shares and units', () => {
    it('reads a share as a share, 1 included, where the source writes shares', () => {
        // OpenWeather's `pop` is always a share: 1 is certain rain.
        expect(readWeather({ temperature: 10, pop: 1 })!.precipitation).toBe(100);
        const days = readWeather({ daily: [{ date: '2026-11-01', high: 9, low: 4, pop: 1 }, { date: '2026-11-02', high: 9, low: 4, pop: 0.35 }] })!;
        expect(days.daily.map((d) => d.precipitation)).toEqual([100, 35]);
        // A series that writes a share anywhere writes shares everywhere.
        const series = readWeather({ temperature: 10, hourly: [{ time: '2026-11-01T10:00', temp: 9, precipitation: 0.2 }, { time: '2026-11-01T11:00', temp: 9, precipitation: 1 }] })!;
        expect(series.hourly.map((h) => h.precipitation)).toEqual([20, 100]);
        // On its own, the documented rule: 40 is 40 %, 0.4 is 40 %, and 1 is 1 %.
        expect(readWeather({ temperature: 10, precipitation: 1 })!.precipitation).toBe(1);
        expect(readWeather({ temperature: 10, precipitation: 0.4 })!.precipitation).toBe(40);
    });

    it("reads OpenWeather's unit systems as their temperature scale", () => {
        expect(readWeather({ temperature: 50, unit: 'imperial' })!.unit).toBe('F');
        expect(readWeather({ temperature: 10, unit: 'metric' })!.unit).toBe('C');
        expect(readWeather({ temperature: 50, unit: 'Fahrenheit' })!.unit).toBe('F');
        expect(readWeather({ temperature: 10, unit: '°C' })!.unit).toBe('C');
    });
});

describe('the hours and days, read and said', () => {
    const HOURLY = {
        ...LILLE,
        hourly: [
            { time: '2026-11-01T10:00', temp: 9, condition: 'cloudy', precipitation: 10 },
            { time: '2026-11-01T11:00', temp: 10, condition: 'rain', precipitation: 60 },
        ],
        daily: [{ date: '2026-11-01', high: 14, low: 7, condition: 'rain', precipitation: 70 }],
    };

    it("writes a chance of rain as the chat's language writes a percentage", () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        const percent = new Intl.NumberFormat('fr-FR', { style: 'percent' }).format(0.6);
        stop = setupWeatherCard({ tool: 'get_weather', map: (r) => r });
        expect(draw(call('resolved', HOURLY)).querySelector('.aparte-weather__hour-rain')!.textContent).toBe(percent);
        stop();
        stop = setupWeatherCard({ tool: 'get_weather', map: (r) => r, variant: 'forecast' });
        expect(draw(call('resolved', HOURLY)).querySelector('.aparte-weather__day-rain')!.textContent)
            .toBe(new Intl.NumberFormat('fr-FR', { style: 'percent' }).format(0.7));
    });

    it("says each hour's sky in words, not only in a hidden glyph, and again after a language switch", () => {
        stop = setupWeatherCard({ tool: 'get_weather', map: (r) => r });
        const renderer = aparteGlobalConfig.getToolRenderer('get_weather')!;
        const card = draw(call('resolved', HOURLY));
        const said = () => [...card.querySelectorAll('.aparte-weather__hour .aparte-sr-only')].map((n) => n.textContent);
        expect(said()).toEqual(['Cloudy', 'Rain']);
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        renderer.relabel!(card, call('resolved', HOURLY));
        expect(said()).toEqual(['Couvert', 'Pluie']);
    });
});

describe('the weather sheet', () => {
    // Read from disk: under vitest a `?raw` CSS import comes back empty. The cwd is the
    // package (`pnpm -C`) or the repo's root (`pnpm test`).
    const path = ['src/weather/weather.css', 'packages/plugins/cards/src/weather/weather.css'].find((p) => existsSync(p))!;
    const rules = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    it("declares its tokens with no weight, so an app's own `.aparte-weather-card { … }` wins", () => {
        // Core appends a renderer's sheet after the app's CSS: at equal weight, the card would win.
        expect(rules).toMatch(/:where\(\.aparte-weather-card\)\s*\{\s*--aparte-weather-sun:/);
        expect(rules).not.toMatch(/(^|\})\s*\.aparte-weather-card\s*\{\s*--aparte-weather-sun:/);
    });

    it("narrows on the card's own width, not the window's", () => {
        expect(rules).not.toMatch(/@media\s*\([^)]*width/);
        expect(rules).toMatch(/container:\s*aparte-weather\s*\/\s*inline-size/);
        expect(rules).toMatch(/@container aparte-weather \(max-width:/);
    });

    it("turns the sun's rays with core's own keyframe, not a copy of it", () => {
        expect(rules).not.toMatch(/@keyframes aparte-weather-spin/);
        expect(rules).toMatch(/animation:\s*aparte-spin\s/);
    });
});
