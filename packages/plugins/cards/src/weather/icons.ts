/**
 * The weather glyphs: one 64 × 64 drawing per condition, day and night, built from a few
 * parts (sun, moon, cloud, drops, flakes, bolt). Coloured and animated by the sheet
 * through their classes — `--aparte-weather-*` tokens, so a theme recolours the sky.
 *
 * They live here and not in core's `icons/`: core's set is what core draws, and core
 * draws no weather. These are constants of the package, the only markup a card parses.
 */
import type { WeatherCondition } from './conditions.js';

const r = (n: number) => Math.round(n * 100) / 100;

const RAYS = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return `M${r(32 + 16 * Math.cos(a))} ${r(32 + 16 * Math.sin(a))}L${r(32 + 22 * Math.cos(a))} ${r(32 + 22 * Math.sin(a))}`;
}).join('');

const SUN = `<g class="aparte-wx-sun-g"><path class="aparte-wx-rays" d="${RAYS}"/><circle class="aparte-wx-sun" cx="32" cy="32" r="11"/></g>`; // safe-attr: this package's own glyph constants and loop numbers, never data
const MOON = `<g class="aparte-wx-moon-g"><path class="aparte-wx-moon" d="M38.5 16.5A16 16 0 1 0 47.5 44.5A12.5 12.5 0 0 1 38.5 16.5Z"/><circle class="aparte-wx-star" cx="48" cy="17" r="1.6"/><circle class="aparte-wx-star" cx="54" cy="27" r="1.1"/></g>`;
const CLOUD_PATH = 'M22 46H46A9 9 0 0 0 47 28.06A13 13 0 0 0 22.4 25.1A10.5 10.5 0 0 0 22 46Z';
const cloud = (cls: string, transform = '') => `<path class="${cls}"${transform ? ` transform="${transform}"` : ''} d="${CLOUD_PATH}"/>`; // safe-attr: this package's own glyph constants and loop numbers, never data

/** The sun or the moon, small, behind a cloud. */
const behind = (night: boolean) => `<g transform="translate(-6.5 -6.5) scale(0.72)" class="aparte-wx-behind">${night ? MOON : SUN}</g>`; // safe-text: this package's own SVG, built from its glyph constants

const drops = (n: number, cls = 'aparte-wx-drop') => {
    const xs = n === 5 ? [19, 26, 33, 40, 47] : n === 4 ? [22, 29, 36, 43] : n === 2 ? [24, 32] : [24, 32, 40];
    return `<g class="aparte-wx-fall">${xs.map((x, i) => `<path class="${cls}" style="--i:${i}" d="M${x} ${46 + (i % 2) * 3}l-2.5 6"/>`).join('')}</g>`; // safe-attr: this package's own glyph constants and loop numbers, never data // safe-text: this package's own SVG, built from its glyph constants
};
const dots = (n: number) => {
    const xs = n === 4 ? [22, 29, 36, 43] : [24, 32, 40];
    return `<g class="aparte-wx-fall">${xs.map((x, i) => `<circle class="aparte-wx-drip" style="--i:${i}" cx="${x}" cy="${49 + (i % 2) * 3}" r="1.8"/>`).join('')}</g>`; // safe-attr: this package's own glyph constants and loop numbers, never data // safe-text: this package's own SVG, built from its glyph constants
};
const flakes = (xs: number[]) =>
    `<g class="aparte-wx-drift-down">${xs.map((x, i) => `<g class="aparte-wx-flake" style="--i:${i}" transform="translate(${x} ${50 + (i % 2) * 4})"><path d="M0 -3.2V3.2M-2.8 -1.6L2.8 1.6M-2.8 1.6L2.8 -1.6"/></g>`).join('')}</g>`; // safe-attr: numbers computed here, never data // safe-text: this package's own SVG, built from its glyph constants
const BOLT = '<path class="aparte-wx-bolt" d="M34.5 40 26 53h6.5l-3 10L41 48.5h-6.5l4.5-8.5z"/>';
const FOG = '<g class="aparte-wx-fog-g"><path class="aparte-wx-fog" d="M14 49H50M18 55H46M22 61H42"/></g>';
const WIND = '<g class="aparte-wx-wind-g"><path class="aparte-wx-wind" d="M9 25h26a6 6 0 1 0-6-6"/><path class="aparte-wx-wind" d="M9 33h37a6.5 6.5 0 1 1-6.5 6.5"/><path class="aparte-wx-wind" d="M9 41h18"/></g>';

/** The glyph for a condition, by day or by night, as markup for `glyph()`. */
export function weatherIcon(condition: WeatherCondition, night = false): string {
    const up = 'translate(0 -6)';
    let body: string;
    switch (condition) {
        case 'clear':
            body = night ? MOON : SUN;
            break;
        case 'partly-cloudy':
            body = `${behind(night)}<g class="aparte-wx-drift">${cloud('aparte-wx-cloud', 'translate(4 6)')}</g>`; // safe-text: this package's own SVG, built from its glyph constants
            break;
        case 'cloudy':
            body = `${cloud('aparte-wx-cloud-back', 'translate(8 -5) scale(0.82)')}<g class="aparte-wx-drift">${cloud('aparte-wx-cloud', 'translate(-2 4)')}</g>`; // safe-text: this package's own SVG, built from its glyph constants
            break;
        case 'fog':
            body = `${cloud('aparte-wx-cloud', 'translate(0 -8)')}${FOG}`;
            break;
        case 'drizzle':
            body = `${cloud('aparte-wx-cloud', up)}${dots(4)}`;
            break;
        case 'rain':
            body = `${cloud('aparte-wx-cloud', up)}${drops(3)}`;
            break;
        case 'heavy-rain':
            body = `${cloud('aparte-wx-cloud-back', 'translate(9 -12) scale(0.8)')}${cloud('aparte-wx-cloud aparte-wx-cloud--dark', up)}${drops(5)}`;
            break;
        case 'sleet':
            body = `${cloud('aparte-wx-cloud', up)}${drops(2)}${flakes([40])}`;
            break;
        case 'snow':
            body = `${cloud('aparte-wx-cloud', up)}${flakes([23, 32, 41])}`;
            break;
        case 'thunder':
            body = `${cloud('aparte-wx-cloud-back', 'translate(9 -12) scale(0.8)')}${cloud('aparte-wx-cloud aparte-wx-cloud--dark', up)}${BOLT}`;
            break;
        case 'wind':
            body = WIND;
            break;
    }
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" class="aparte-wx" data-condition="${condition}"${night ? ' data-night=""' : ''}>${body}</svg>`; // safe-attr: a WeatherCondition, one of eleven constants // safe-text: this package's own SVG, built from its glyph constants
}
