/**
 * `?plugin-card`: the scripted `get_weather` call drawn by `@aparte/plugin-cards` rather than
 * core's row — the weather card, or with `?plugin-card=stock` the stock card and its range
 * buttons, a card that answers its own controls. Off by default, because the approval,
 * agent-loop and tool-row specs read core's row.
 *
 * The stock card stands in for any live card: what its `onChange` returns must survive what
 * each framework does to a message once it is on screen (a turn ending, the conversation
 * saved, left and opened again), and the e2e suite proves it in every example.
 */
import { setupWeatherCard, conditionFromText } from '@aparte/plugin-cards/weather';
import { setupStockCard } from '@aparte/plugin-cards/stock';

export const PLUGIN_CARD = new URLSearchParams(window.location.search).get('plugin-card');

/** A made-up quote over a range: a gentle wave for a day, a wider one for a year. */
function quote(range: string) {
    const year = range === '1Y';
    return {
        symbol: 'ACME', currency: 'USD', price: 184.6, change: 2.35, changePercent: 1.29, previousClose: 182.25,
        range, ranges: ['1D', '5D', '1M', '1Y'],
        series: Array.from({ length: 30 }, (_, i) => 180 + Math.sin(i / (year ? 2 : 5)) * (year ? 20 : 3) + i * 0.1),
    };
}

/** Draw `get_weather` with a card of `@aparte/plugin-cards`, when the page asks for one. */
export function setupPluginCard(): void {
    if (PLUGIN_CARD === null) return;
    if (PLUGIN_CARD === 'stock') {
        setupStockCard({
            tool: 'get_weather',
            map: () => quote('1D'),
            onChange: ({ name, value }) => (name === 'range' ? quote(String(value)) : undefined),
        });
        return;
    }
    // The scripted tool answers in words ("Cloudy, 14 °C in Lille."): `map` reads them.
    setupWeatherCard({
        tool: 'get_weather',
        map: (result, input) => ({
            location: String(input['city'] ?? ''),
            condition: conditionFromText(String(result)),
            temperature: Number(/(-?\d+)\s*°/.exec(String(result))?.[1]),
        }),
    });
}
