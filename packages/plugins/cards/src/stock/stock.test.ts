import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, getSegmentRenderer, type AparteToolCallSegment } from '@aparte/core';
import { setupStockCard, stockCard, readQuotes, digitsOf, baselineOf, directionOf, type Quote, type StockData } from './index.js';
import { candleGeometry, chartGeometry, groupCandles, thin } from './chart.js';

const AAPL = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    price: 182.52,
    currency: 'USD',
    change: 1.23,
    changePercent: 0.68,
    previousClose: 181.29,
    open: 181.5,
    high: 183.1,
    low: 180.9,
    volume: 52_300_000,
    marketCap: 2_850_000_000_000,
    yearHigh: 199.62,
    yearLow: 164.08,
    series: [181.29, 181.0, 180.9, 182.0, 183.1, 182.52],
    range: '1D',
    marketState: 'open',
    url: 'https://finance.example.com/AAPL',
};
const MSFT = { symbol: 'MSFT', name: 'Microsoft', price: 410.1, currency: 'USD', change: -2.4, series: [412.5, 411, 410.1] };
const BTC = { symbol: 'btc', name: 'Bitcoin', current_price: 67234.12, price_change_percentage_24h: 0, currency: 'USD' };
const LIST = { title: 'Tech', quotes: [AAPL, MSFT, BTC] };

let stop: () => void = () => {};
beforeEach(() => aparteGlobalConfig.extendLocale({ tag: 'en-US' }));
afterEach(() => {
    stop();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

function call(status: AparteToolCallSegment['status'], result?: unknown, input: Record<string, unknown> = { symbol: 'AAPL' }): AparteToolCallSegment {
    return {
        id: 's1', type: 'tool_call', status,
        toolCall: { id: 'c1', name: 'get_quote', input },
        ...(result !== undefined ? { structuredResult: result, result: JSON.stringify(result) } : {}),
    };
}

function draw(segment: AparteToolCallSegment): HTMLElement {
    const renderer = aparteGlobalConfig.getToolRenderer('get_quote')!;
    const out = renderer.render(segment);
    expect(out).toBeInstanceOf(HTMLElement);
    document.body.append(out as HTMLElement);
    return out as HTMLElement;
}

const text = (root: Element, selector: string) => root.querySelector(selector)?.textContent ?? null;
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((n) => n.textContent);
const quote = (raw: unknown) => readQuotes(raw)!.quotes[0]!;

describe('the stock card on a tool', () => {
    beforeEach(() => {
        stop = setupStockCard({ tool: 'get_quote' });
    });

    it('draws one quote as its chart card, named by its symbol and name', () => {
        const card = draw(call('resolved', AAPL));
        expect(card.dataset.card).toBe('stock');
        expect(card.dataset.variant).toBe('chart');
        expect(card.dataset.state).toBe('ready');
        expect(card.getAttribute('aria-label')).toBe('AAPL Apple Inc.');
        expect(card.querySelector('.aparte-stock--chart')!.getAttribute('data-direction')).toBe('up');
    });

    it('shows a skeleton, with the symbol asked for, while the call runs', () => {
        const card = draw(call('pending', undefined, { symbol: 'aapl' }));
        expect(card.dataset.state).toBe('loading');
        expect(card.getAttribute('aria-busy')).toBe('true');
        expect(card.getAttribute('aria-label')).toBe('AAPL — Loading');
        expect(text(card, '.aparte-stock--skeleton .aparte-stock__symbol')).toBe('AAPL');
        expect(card.querySelector('.aparte-stock__sk-chart')).not.toBeNull();
        expect(card.querySelectorAll('.aparte-stock__stats .aparte-stock__stat')).toHaveLength(6);
        const bare = draw(call('pending', undefined, {}));
        expect(bare.getAttribute('aria-label')).toBe('Market quote — Loading');
        expect(bare.querySelector('.aparte-stock__sk-symbol')).not.toBeNull();
    });

    it('draws a skeleton of rows when the call asked for several symbols', () => {
        const card = draw(call('pending', undefined, { symbols: ['AAPL', 'msft', 'NVDA', 'TSLA'] }));
        expect(card.getAttribute('aria-label')).toBe('AAPL, MSFT, NVDA, TSLA — Loading');
        expect(texts(card, '.aparte-stock--skeleton .aparte-stock__symbol')).toEqual(['AAPL', 'MSFT', 'NVDA', 'TSLA']);
        expect(draw(call('pending', undefined, { tickers: 'AAPL, MSFT' })).querySelectorAll('.aparte-stock--row')).toHaveLength(3);
    });

    it('shrinks to one line, never a card, when the call waited, was refused or failed', () => {
        expect(draw(call('awaiting-approval')).textContent).toContain('Waiting for your approval');
        expect(draw(call('rejected')).textContent).toContain('Not run');
        const failed = draw(call('failed'));
        expect(failed.dataset.state).toBe('unavailable');
        expect(failed.querySelector('.aparte-stock')).toBeNull();
        expect(failed.textContent).toContain('AAPL');
    });

    it('says it is unavailable, and warns once, when the result has no quote it can draw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const card = draw(call('resolved', { quotes: [{ symbol: 'X' }] }));
        draw(call('resolved', [{ price: 3 }]));
        expect(card.dataset.state).toBe('unavailable');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('patches the same element when the result lands', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('get_quote')!;
        const card = draw(call('pending'));
        renderer.update!(card, call('resolved', AAPL));
        expect(card.dataset.state).toBe('ready');
        expect(card.hasAttribute('aria-busy')).toBe(false);
        expect(card.getAttribute('aria-label')).toBe('AAPL Apple Inc.');
        expect(text(card, '.aparte-stock__price')).toBe('182.52');
    });

    it('relabels words, numbers and the chart in place on a language switch, adding no node', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('get_quote')!;
        const card = draw(call('resolved', AAPL));
        const count = card.querySelectorAll('*').length;
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        renderer.relabel!(card, call('resolved', AAPL));
        expect(card.querySelectorAll('*').length).toBe(count);
        expect(text(card, '.aparte-stock__price')).toBe('182,52');
        expect(text(card, '.aparte-stock__quote .aparte-stock__change-text')).toMatch(/^\+1,23 \(\+0,68\s%\)$/u);
        expect(text(card, '.aparte-stock__market-text')).toBe('Marché ouvert');
        expect(texts(card, '.aparte-stock__stat-term')).toEqual(['Ouverture', 'Plus haut', 'Plus bas', 'Clôture veille', 'Volume', 'Capitalisation', 'Sur 52 semaines']);
        expect(text(card, '.aparte-stock__range')).toMatch(/^1\sjour$/u);
        expect(text(card, '.aparte-stock__legend-text')).toBe('Clôture veille 181,29');
        expect(card.querySelector('.aparte-stock__plot')!.getAttribute('aria-label')).toMatch(/^Graphique du cours, 1\sjour : plus bas 180,90, plus haut 183,10, dernier 182,52$/u);
        expect(text(card, '.aparte-stock__extreme--hi')).toBe('183,10');
        expect(text(card, '.aparte-stock__year-low')).toBe('164,08');
    });

    it("takes the app's own word over the package's", () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR', cardsStockMarketOpen: 'Séance en cours' });
        expect(text(draw(call('resolved', AAPL)), '.aparte-stock__market-text')).toBe('Séance en cours');
    });

    it('never parses a value from the tool as markup, and draws no unsafe link', () => {
        const card = draw(call('resolved', {
            symbol: '<img src=x onerror="window.__pwned=1">',
            name: '<b>Evil</b>',
            exchange: '<script>x</script>',
            price: 1,
            url: 'javascript:alert(1)',
        }));
        expect(card.querySelector('img, b, script')).toBeNull();
        // A lowercase symbol is read in capitals; it is still only text.
        expect(text(card, '.aparte-stock__symbol')).toBe('<IMG SRC=X ONERROR="WINDOW.__PWNED=1">');
        expect(text(card, '.aparte-stock__name')).toBe('<b>Evil</b>');
        expect(card.querySelector('a')).toBeNull();
        expect(card.querySelector('button')).toBeNull();
        expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    });
});

describe('the chart variant', () => {
    beforeEach(() => {
        stop = setupStockCard({ tool: 'get_quote' });
    });

    it('heads the card with the symbol, the name, the exchange, the market and the time', () => {
        const time = new Date();
        time.setHours(16, 0, 0, 0);
        const card = draw(call('resolved', { ...AAPL, time: time.toISOString() }));
        const link = card.querySelector<HTMLAnchorElement>('a.aparte-stock__symbol')!;
        expect(link.textContent).toBe('AAPL');
        expect(link.href).toBe('https://finance.example.com/AAPL');
        expect(link.target).toBe('_blank');
        expect(link.rel).toBe('noopener noreferrer');
        expect(text(card, '.aparte-stock__name')).toBe('Apple Inc.');
        expect(text(card, '.aparte-stock__exchange')).toBe('NASDAQ');
        expect(card.querySelector('.aparte-stock__market')!.getAttribute('data-market')).toBe('open');
        expect(text(card, '.aparte-stock__market-text')).toBe('Market open');
        const when = card.querySelector('time.aparte-stock__time')!;
        expect(when.getAttribute('datetime')).toBe(time.toISOString());
        expect(when.textContent).toMatch(/^As of 4\sPM$/u);
    });

    it('writes the price big with its currency, and the change with its sign and arrow', () => {
        const card = draw(call('resolved', AAPL));
        expect(text(card, '.aparte-stock__price')).toBe('182.52');
        expect(text(card, '.aparte-stock__currency')).toBe('USD');
        const pill = card.querySelector('.aparte-stock__quote .aparte-stock__change')!;
        expect(pill.getAttribute('data-direction')).toBe('up');
        expect(pill.querySelector('.aparte-stock__arrow')!.getAttribute('aria-hidden')).toBe('true');
        expect(text(pill, '.aparte-stock__change-text')).toBe('+1.23 (+0.68%)');
        const down = draw(call('resolved', MSFT));
        expect(text(down, '.aparte-stock__quote .aparte-stock__change-text')).toBe('-2.40 (-0.58%)');
        expect(down.querySelector('.aparte-stock__quote .aparte-stock__change')!.getAttribute('data-direction')).toBe('down');
    });

    it('draws the chart: two areas split at the previous close, the line, the extremes and the last point', () => {
        const card = draw(call('resolved', AAPL));
        const plot = card.querySelector('.aparte-stock__plot')!;
        expect(plot.getAttribute('role')).toBe('application');
        expect(plot.getAttribute('tabindex')).toBe('0');
        expect(plot.getAttribute('dir')).toBe('ltr');
        expect(plot.getAttribute('aria-label')).toBe('Price chart, 1 day: low 180.90, high 183.10, last 182.52');
        const svg = plot.querySelector('svg')!;
        expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
        expect(svg.getAttribute('aria-hidden')).toBe('true');
        // Each area and each stroke is clipped to a band that exists in this chart's own defs.
        for (const path of svg.querySelectorAll('.aparte-stock__area, .aparte-stock__line')) {
            const id = /url\(#([^)]+)\)/.exec(path.getAttribute('clip-path')!)![1]!;
            expect(svg.querySelector(`clipPath[id="${id}"]`)).not.toBeNull();
        }
        expect(svg.querySelectorAll('.aparte-stock__line[vector-effect="non-scaling-stroke"]')).toHaveLength(2);
        expect(svg.querySelectorAll('.aparte-stock__stop--up')).toHaveLength(2);
        expect(text(plot, '.aparte-stock__extreme--hi')).toBe('183.10');
        expect(text(plot, '.aparte-stock__extreme--lo')).toBe('180.90');
        expect(plot.querySelector('.aparte-stock__extreme--hi')!.getAttribute('data-align')).toBe('center');
        expect(plot.querySelector<HTMLElement>('.aparte-stock__dot')!.style.getPropertyValue('--aparte-stock-x')).toBe('100.00%');
        expect(plot.querySelector('.aparte-stock__dot')!.hasAttribute('data-live')).toBe(true);
        expect(plot.querySelector('.aparte-stock__dot')!.getAttribute('data-direction')).toBe('up');
        expect(plot.querySelector<HTMLElement>('.aparte-stock__baseline')!.style.getPropertyValue('--aparte-stock-y')).toMatch(/%$/);
        expect(text(card, '.aparte-stock__range')).toBe('1 day');
        expect(text(card, '.aparte-stock__legend-text')).toBe('Prev. close 181.29');
        // Two charts on one page do not share their clip paths.
        const other = draw(call('resolved', AAPL));
        expect(other.querySelector('clipPath')!.id).not.toBe(card.querySelector('clipPath')!.id);
    });

    it('splits a longer range at its start, and says how far it moved over it', () => {
        const card = draw(call('resolved', { ...AAPL, range: '1Y', series: [150, 140, 170, 182.52] }));
        expect(text(card, '.aparte-stock__range')).toBe('1 year');
        expect(card.querySelector('.aparte-stock__legend')).toBeNull();
        const moved = card.querySelector('.aparte-stock__change--range')!;
        expect(moved.getAttribute('data-direction')).toBe('up');
        expect(moved.textContent).toBe('+21.68%');
        // The day fell, the year rose: the last point is coloured by the chart, the pill by the day.
        const fell = draw(call('resolved', { ...MSFT, range: '1Y', series: [300, 410.1] }));
        expect(fell.querySelector('.aparte-stock__dot')!.getAttribute('data-direction')).toBe('up');
        expect(fell.querySelector('.aparte-stock__quote .aparte-stock__change')!.getAttribute('data-direction')).toBe('down');
        expect(draw(call('resolved', { ...AAPL, range: 'YTD' })).querySelector('.aparte-stock__range')!.textContent).toBe('YTD');
        // A start at zero has no percentage to give.
        expect(draw(call('resolved', { ...AAPL, range: '5Y', series: [0, 1] })).querySelector('.aparte-stock__change--range')).toBeNull();
    });

    it('draws no chart under two points, and no extremes for a flat series', () => {
        expect(draw(call('resolved', { ...AAPL, series: [1] })).querySelector('.aparte-stock__chart')).toBeNull();
        const flat = draw(call('resolved', { symbol: 'X', price: 5, series: [5, 5, 5] }));
        expect(flat.querySelector('.aparte-stock__chart')).not.toBeNull();
        expect(flat.querySelector('.aparte-stock__extreme')).toBeNull();
        expect(flat.querySelector('.aparte-stock__chart-info')!.childNodes).toHaveLength(1);
        expect(flat.querySelector('.aparte-stock__dot')!.hasAttribute('data-live')).toBe(false);
    });

    it('is explored by pointer, with the value under the cursor in a live readout', () => {
        const card = draw(call('resolved', AAPL));
        const chart = card.querySelector('.aparte-stock__chart')!;
        const plot = chart.querySelector<HTMLElement>('.aparte-stock__plot')!;
        expect(chart.querySelector('.aparte-stock__readout')!.getAttribute('aria-live')).toBe('polite');
        const readout = chart.querySelector('.aparte-stock__readout-shown')!;
        const said = chart.querySelector('.aparte-stock__readout .aparte-sr-only')!;
        const count = card.querySelectorAll('*').length;
        // No box yet (jsdom lays nothing out): nothing to point at.
        plot.dispatchEvent(new MouseEvent('pointermove', { clientX: 10 }));
        expect(chart.hasAttribute('data-scrub')).toBe(false);
        plot.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 100, right: 300, bottom: 100, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect;
        plot.dispatchEvent(new MouseEvent('pointermove', { clientX: 100 }));
        expect(chart.hasAttribute('data-scrub')).toBe(true);
        expect(readout.textContent).toBe('181.29');
        expect(said.textContent).toBe('181.29');
        expect(chart.querySelector<HTMLElement>('.aparte-stock__cursor')!.style.getPropertyValue('--aparte-stock-x')).toBe('0.00%');
        plot.dispatchEvent(new MouseEvent('pointerdown', { clientX: 500 }));
        expect(readout.textContent).toBe('182.52');
        expect(card.querySelectorAll('*').length).toBe(count);
        plot.dispatchEvent(new MouseEvent('pointerleave'));
        expect(chart.hasAttribute('data-scrub')).toBe(false);
        expect(readout.textContent).toBe('');
        plot.dispatchEvent(new MouseEvent('pointermove', { clientX: 180 }));
        plot.dispatchEvent(new MouseEvent('pointercancel'));
        expect(readout.textContent).toBe('');
        // A click focuses the plot, yet the cursor it put there leaves with the mouse.
        plot.dispatchEvent(new MouseEvent('pointerdown', { clientX: 140 }));
        plot.focus();
        expect(readout.textContent).toBe('181.00');
        plot.dispatchEvent(new MouseEvent('pointerleave'));
        expect(readout.textContent).toBe('');
    });

    it('is explored by keyboard: the arrows, Home, End and Page keys move the cursor', () => {
        const times = Array.from({ length: 6 }, (_, i) => new Date(2026, 9, 30, 10 + i).toISOString());
        const card = draw(call('resolved', { ...AAPL, series: AAPL.series.map((value, i) => ({ time: times[i], value })) }));
        const plot = card.querySelector<HTMLElement>('.aparte-stock__plot')!;
        const node = card.querySelector('.aparte-stock__readout-shown')!;
        const readout = { get textContent() { return node.textContent!.replace(/\s/gu, ' '); } };
        const key = (k: string, shiftKey = false) => plot.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, cancelable: true }));
        plot.focus();
        expect(readout.textContent).toBe('182.52 · 3 PM');
        key('ArrowLeft');
        expect(readout.textContent).toBe('183.10 · 2 PM');
        key('Home');
        expect(readout.textContent).toBe('181.29 · 10 AM');
        key('ArrowLeft');
        expect(readout.textContent).toBe('181.29 · 10 AM');
        key('PageDown');
        expect(readout.textContent).toBe('181.00 · 11 AM');
        key('ArrowRight', true);
        expect(readout.textContent).toBe('180.90 · 12 PM');
        key('End');
        expect(readout.textContent).toBe('182.52 · 3 PM');
        key('PageUp');
        expect(readout.textContent).toBe('183.10 · 2 PM');
        expect(key('a')).toBe(true);
        // The pointer leaving a focused chart leaves the keyboard's cursor where it is.
        plot.dispatchEvent(new MouseEvent('pointerleave'));
        expect(readout.textContent).toBe('183.10 · 2 PM');
        key('Escape');
        expect(readout.textContent).toBe('');
        key('ArrowRight');
        expect(readout.textContent).toBe('182.52 · 3 PM');
        plot.blur();
        expect(readout.textContent).toBe('');
    });

    it('writes a point time as fine as the series is long', () => {
        const at = (days: number[]) => days.map((d, i) => ({ time: new Date(2026, 0, 1 + d, 12).toISOString(), value: 10 + i }));
        const readAt = (series: unknown) => {
            const card = draw(call('resolved', { symbol: 'X', price: 12, range: 'custom', series }));
            card.querySelector<HTMLElement>('.aparte-stock__plot')!.focus();
            return text(card, '.aparte-stock__readout-shown')!.replace(/\s/gu, ' ');
        };
        expect(readAt(at([0, 2, 4]))).toMatch(/^12\.00 · Mon,? 12:00 PM$/u);
        expect(readAt(at([0, 100, 200]))).toBe('12.00 · Jul 20');
        expect(readAt(at([0, 400, 800]))).toBe('12.00 · Mar 2028');
    });

    it('lists the figures it has, and the 52-week range as a bar with the price on it', () => {
        const card = draw(call('resolved', AAPL));
        const dl = card.querySelector('dl.aparte-stock__stats')!;
        expect(texts(dl, 'dt')).toEqual(['Open', 'High', 'Low', 'Prev. close', 'Volume', 'Market cap', '52-week range']);
        expect(texts(dl, '.aparte-stock__stat:not(.aparte-stock__stat--wide) dd')).toEqual(['181.50', '183.10', '180.90', '181.29', '52.3M', '$2.85T']);
        expect(text(dl, '.aparte-stock__year-low')).toBe('164.08');
        expect(text(dl, '.aparte-stock__year-high')).toBe('199.62');
        const bar = dl.querySelector<HTMLElement>('.aparte-stock__year-bar')!;
        expect(bar.getAttribute('aria-hidden')).toBe('true');
        expect(bar.style.getPropertyValue('--aparte-stock-position')).toBe('51.9%');
        const bare = draw(call('resolved', { symbol: 'X', price: 2 }));
        expect(bare.querySelector('.aparte-stock__stats, .aparte-stock__change, .aparte-stock__meta, .aparte-stock__name, .aparte-stock__currency')).toBeNull();
        expect(bare.textContent).not.toMatch(/NaN|undefined/);
    });

    it('writes the time as a day for a close, and with its day when it is not today', () => {
        expect(text(draw(call('resolved', { ...AAPL, time: '2024-01-05' })), '.aparte-stock__time')).toBe('As of Jan 5, 2024');
        expect(text(draw(call('resolved', { ...AAPL, time: '2024-01-05T15:30:00' })), '.aparte-stock__time')).toMatch(/^As of Jan 5, 3:30\sPM$/u);
    });

    it('draws several quotes as rows', () => {
        const card = draw(call('resolved', LIST));
        expect(card.dataset.variant).toBe('chart');
        expect(card.querySelector('.aparte-stock--chart')).toBeNull();
        expect(card.querySelectorAll('.aparte-stock__list > li > .aparte-stock--row')).toHaveLength(3);
        expect(text(card, '.aparte-stock__heading')).toBe('Tech');
        expect(card.getAttribute('aria-label')).toBe('Tech');
    });
});

describe('the compact variant', () => {
    beforeEach(() => {
        stop = setupStockCard({ tool: 'get_quote', variant: 'compact' });
    });

    it('lists quotes as rows: symbol and name, sparkline in the change colour, price, change', () => {
        const card = draw(call('resolved', [AAPL, MSFT, BTC]));
        expect(card.dataset.variant).toBe('compact');
        expect(card.getAttribute('aria-label')).toBe('3 quotes');
        const list = card.querySelector('ul.aparte-stock__list')!;
        expect(list.getAttribute('role')).toBe('list');
        const rows = [...list.querySelectorAll('.aparte-stock--row')];
        expect(rows.map((r) => r.getAttribute('data-direction'))).toEqual(['up', 'down', 'flat']);
        expect(texts(card, '.aparte-stock--row .aparte-stock__symbol')).toEqual(['AAPL', 'MSFT', 'BTC']);
        expect(texts(card, '.aparte-stock__row-price')).toEqual(['$182.52', '$410.10', '$67,234.12']);
        expect(texts(card, '.aparte-stock__figures .aparte-stock__change-text')).toEqual(['+0.68%', '-0.58%', '0.00%']);
        // Flat has no arrow; its figure says so.
        expect(rows[2]!.querySelector('.aparte-stock__arrow')).toBeNull();
        const spark = rows[0]!.querySelector('svg.aparte-stock__sparkline')!;
        expect(spark.querySelector('.aparte-stock__spark-base')).not.toBeNull();
        expect(spark.querySelector('.aparte-rich-card__sparkline-line')).not.toBeNull();
        expect(rows[2]!.querySelector('.aparte-stock__spark')!.hasAttribute('data-empty')).toBe(true);
        expect(rows[0]!.hasAttribute('data-linked')).toBe(true);
        expect(rows[0]!.querySelector('.aparte-stock__link--stretched')).not.toBeNull();
        expect(rows[1]!.querySelector('a')).toBeNull();
    });

    it('draws one quote as one row, without a list', () => {
        const card = draw(call('resolved', MSFT));
        expect(card.querySelector('ul')).toBeNull();
        expect(card.querySelectorAll('.aparte-stock--row')).toHaveLength(1);
        expect(card.querySelector('.aparte-stock__heading')).toBeNull();
    });

    it('keeps twelve quotes at most', () => {
        const many = Array.from({ length: 15 }, (_, i) => ({ symbol: `S${i}`, price: i + 1 }));
        const card = draw(call('resolved', many));
        expect(card.querySelectorAll('.aparte-stock--row')).toHaveLength(12);
        expect(card.getAttribute('aria-label')).toBe('12 quotes');
    });

    it('has a skeleton of rows', () => {
        const card = draw(call('pending', undefined, { ticker: 'nvda' }));
        expect(card.querySelectorAll('.aparte-stock--skeleton.aparte-stock--row')).toHaveLength(3);
        expect(text(card, '.aparte-stock__symbol')).toBe('NVDA');
    });
});

describe('the ticker variant', () => {
    beforeEach(() => {
        stop = setupStockCard({ tool: 'get_quote', variant: 'ticker' });
    });

    it('draws a strip of quotes to scroll by hand: symbol, price, change', () => {
        const card = draw(call('resolved', LIST));
        expect(text(card, '.aparte-stock__heading')).toBe('Tech');
        const tape = card.querySelector('ul.aparte-stock__tape')!;
        expect(tape.getAttribute('role')).toBe('list');
        expect(tape.getAttribute('tabindex')).toBe('0');
        expect(tape.getAttribute('aria-label')).toBe('Tech');
        const ticks = [...tape.querySelectorAll('li.aparte-stock__tick')];
        expect(ticks.map((t) => t.getAttribute('data-direction'))).toEqual(['up', 'down', 'flat']);
        expect(texts(tape, '.aparte-stock__tick-price')).toEqual(['$182.52', '$410.10', '$67,234.12']);
        expect(texts(tape, '.aparte-stock__change-text')).toEqual(['+0.68%', '-0.58%', '0.00%']);
        expect(ticks[0]!.querySelector('a.aparte-stock__link--stretched')).not.toBeNull();
    });

    it('draws one quote as one tick, and a strip of placeholders while it runs', () => {
        expect(draw(call('resolved', AAPL)).querySelectorAll('.aparte-stock__tick')).toHaveLength(1);
        const pending = draw(call('pending', undefined, { symbols: 'AAPL,MSFT' }));
        expect(pending.querySelectorAll('.aparte-stock__tick--skeleton')).toHaveLength(4);
        expect(texts(pending, '.aparte-stock__tick--skeleton .aparte-stock__symbol')).toEqual(['AAPL', 'MSFT']);
    });
});

describe('choosing a variant', () => {
    it('picks one per result, and reads an unknown name as the default', () => {
        stop = setupStockCard({ tool: 'get_quote', variant: (d) => (d.quotes.length > 1 ? 'ticker' : 'chart') });
        expect(draw(call('resolved', LIST)).dataset.variant).toBe('ticker');
        expect(draw(call('resolved', AAPL)).dataset.variant).toBe('chart');
        stop();
        stop = setupStockCard({ tool: 'get_quote', variant: 'nope' as never });
        expect(draw(call('resolved', AAPL)).dataset.variant).toBe('chart');
    });
});

describe('the stock card as a segment', () => {
    it('draws a card segment, and its fallback writes each quote with its change', () => {
        stop = setupStockCard();
        const segment = stockCard.segment(LIST, { variant: 'compact' });
        expect(segment.fallback).toBe('Tech\nAAPL 182.52 USD, +1.23 (+0.68%)\nMSFT 410.10 USD, -2.40 (-0.58%)\nBTC 67,234.12 USD, 0.00%');
        const out = getSegmentRenderer('card')!.render(segment as never) as HTMLElement;
        expect(out.dataset.card).toBe('stock');
        expect(out.dataset.variant).toBe('compact');
        expect(out.querySelectorAll('.aparte-stock--row')).toHaveLength(3);
        expect(stockCard.segment({ symbol: 'X', price: 3 }).fallback).toBe('X 3.00');
        expect(stockCard.segment({ nothing: 1 }).fallback).toBeUndefined();
    });
});

describe('reading the data', () => {
    it('reads one quote, a list, and a list with a heading', () => {
        expect(readQuotes(AAPL)!.quotes).toHaveLength(1);
        expect(readQuotes([AAPL, MSFT])!.quotes).toHaveLength(2);
        expect(readQuotes(LIST)!.title).toBe('Tech');
        expect(readQuotes({ results: [MSFT] })!.quotes[0]!.symbol).toBe('MSFT');
        expect(readQuotes({ data: [MSFT, { nope: 1 }] })!.quotes).toHaveLength(1);
        expect(readQuotes(null)).toBeNull();
        expect(readQuotes('AAPL')).toBeNull();
        expect(readQuotes({ quotes: [] })).toBeNull();
        expect(readQuotes({ symbol: 'X' })).toBeNull();
        // A quote's own `data` array is its business, not a list of quotes.
        expect(readQuotes({ symbol: 'X', price: 1, data: [1, 2] })!.quotes[0]!.symbol).toBe('X');
    });

    it("reads Yahoo Finance's quote and its quoteResponse", () => {
        const q = quote({
            quoteResponse: { result: [{
                symbol: 'AAPL', shortName: 'Apple', longName: 'Apple Inc.', fullExchangeName: 'NasdaqGS', currency: 'USD',
                regularMarketPrice: 182.52999877929688, regularMarketChange: 1.23, regularMarketChangePercent: 0.6785,
                regularMarketPreviousClose: 181.3, regularMarketOpen: 181.5, regularMarketDayHigh: 183, regularMarketDayLow: 180,
                regularMarketVolume: 1000, marketCap: 5, fiftyTwoWeekHigh: 199, fiftyTwoWeekLow: 164, marketState: 'POST',
                regularMarketTime: 1_730_318_400,
            }] },
        });
        expect(q).toMatchObject({
            symbol: 'AAPL', name: 'Apple', exchange: 'NasdaqGS', currency: 'USD', change: 1.23, changePercent: 0.6785,
            previousClose: 181.3, open: 181.5, high: 183, low: 180, volume: 1000, marketCap: 5, yearHigh: 199, yearLow: 164, marketState: 'post',
        });
        expect(q.time!.getTime()).toBe(1_730_318_400_000);
        // The float's noise is not precision.
        expect(digitsOf(q)).toBe(2);
        expect(quote({ symbol: 'X', price: 1, marketState: 'REGULAR' }).marketState).toBe('open');
        expect(quote({ symbol: 'X', price: 1, marketState: 'PREPRE' }).marketState).toBe('closed');
        expect(quote({ symbol: 'X', price: 1, marketState: 'CLOSED' }).marketState).toBe('closed');
        expect(quote({ symbol: 'X', price: 1, marketState: 'halted' }).marketState).toBeUndefined();
        expect(quote({ symbol: 'X', price: 1, isOpen: false }).marketState).toBe('closed');
        expect(quote({ symbol: 'X', price: 1, is_open: true }).marketState).toBe('open');
    });

    it("reads Alpha Vantage's GLOBAL_QUOTE", () => {
        const q = quote({ 'Global Quote': {
            '01. symbol': 'IBM', '02. open': '160.00', '03. high': '161.50', '04. low': '159.20', '05. price': '161.10',
            '06. volume': '3000000', '07. latest trading day': '2024-01-05', '08. previous close': '159.90',
            '09. change': '1.2000', '10. change percent': '0.7505%',
        } });
        expect(q).toMatchObject({ symbol: 'IBM', price: 161.1, open: 160, high: 161.5, low: 159.2, volume: 3_000_000, previousClose: 159.9, change: 1.2, changePercent: 0.7505 });
        expect(q.time!.getDate()).toBe(5);
        expect(q.time!.getHours()).toBe(0);
    });

    it("reads Finnhub's quote beside a symbol", () => {
        const q = quote({ symbol: 'AAPL', c: 182.5, d: -1.5, dp: -0.815, pc: 184, h: 185, l: 181, o: 183.9, t: 1_730_318_400 });
        expect(q).toMatchObject({ price: 182.5, change: -1.5, changePercent: -0.815, previousClose: 184, high: 185, low: 181, open: 183.9 });
        expect(q.time!.getTime()).toBe(1_730_318_400_000);
        // Without a symbol it is no quote; an unknown symbol's zeros are none either.
        expect(readQuotes({ c: 182.5, d: 1 })).toBeNull();
        expect(readQuotes({ symbol: 'NOPE', c: 0, d: null, dp: null, pc: 0, t: 0 })).toBeNull();
        expect(quote({ symbol: 'X', c: 3, t: 0 }).time).toBeUndefined();
    });

    it("reads CoinGecko's markets, with its week of prices", () => {
        const q = quote([{
            id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 67000, price_change_24h: -500, price_change_percentage_24h: -0.74,
            market_cap: 1.3e12, total_volume: 2.5e10, high_24h: 68000, low_24h: 66000, last_updated: '2026-10-30T12:00:00.000Z',
            sparkline_in_7d: { price: [64000, 65000, 'n/a', 67000] },
        }]);
        expect(q).toMatchObject({ symbol: 'BTC', price: 67000, change: -500, changePercent: -0.74, marketCap: 1.3e12, volume: 2.5e10, high: 68000, low: 66000, range: '7D', previousClose: 67500 });
        expect(q.series.map((p) => p.value)).toEqual([64000, 65000, 67000]);
        // A week's chart is split where the week began.
        expect(baselineOf(q)).toEqual({ value: 64000, kind: 'start' });
        expect(quote({ symbol: 'eth', current_price: 1, prices: [[1_730_000_000_000, 2], [1_729_000_000_000, 1]] }).series.map((p) => p.value)).toEqual([1, 2]);
    });

    it('derives only what is missing, and never recomputes what the tool gave', () => {
        // From the previous close: the change and the percentage.
        const a = quote({ symbol: 'X', price: 110, previousClose: 100 });
        expect(a.change).toBeCloseTo(10);
        expect(a.changePercent).toBeCloseTo(10);
        // From the change: the previous close, then the percentage.
        const b = quote({ symbol: 'X', price: 110, change: 10 });
        expect(b.previousClose).toBe(100);
        expect(b.changePercent).toBeCloseTo(10);
        // From the percentage alone: a previous close good enough for the baseline, but not
        // written as a figure, and no change invented.
        const c = quote({ symbol: 'X', price: 110, changePercent: '10%', series: [100, 110] });
        expect(c.previousClose).toBeCloseTo(100);
        expect(c.change).toBeUndefined();
        stop = setupStockCard({ tool: 'get_quote' });
        const card = draw(call('resolved', { symbol: 'X', price: 110, changePercent: 10, open: 101, series: [100, 110] }));
        expect(texts(card, 'dt')).toEqual(['Open']);
        expect(text(card, '.aparte-stock__quote .aparte-stock__change-text')).toBe('+10.00%');
        // All three given and inconsistent: all three shown as given.
        const d = quote({ symbol: 'X', price: 110, change: 5, changePercent: 1, previousClose: 100 });
        expect(d).toMatchObject({ change: 5, changePercent: 1, previousClose: 100 });
        expect(quote({ symbol: 'X', price: 5, change: 5 }).previousClose).toBeUndefined();
        expect(quote({ symbol: 'X', price: 5, changePercent: -100 }).previousClose).toBeUndefined();
    });

    it('reads a series in the usual shapes, in time order', () => {
        const q = quote({ symbol: 'x', price: 1, history: [{ date: '2024-01-03', close: 3 }, { date: '2024-01-01', close: 1 }, { date: '2024-01-02', close: '2' }, { close: 'bad' }] });
        expect(q.symbol).toBe('X');
        expect(q.series.map((p) => p.value)).toEqual([1, 2, 3]);
        expect(quote({ symbol: 'X', price: 1, series: [{ t: 1, value: 2 }, 3] }).series.map((p) => p.value)).toEqual([2, 3]);
        expect(quote({ symbol: 'X', price: 1, series: 'nope' }).series).toEqual([]);
        expect(quote({ symbol: 'X', price: 1, series: Array.from({ length: 2500 }, (_, i) => i) }).series).toHaveLength(2000);
    });

    it('drops a 52-week range the wrong way round, a negative volume, and an unsafe link', () => {
        const q = quote({ symbol: 'Mixed', price: 1, yearHigh: 1, yearLow: 2, volume: -4, url: 'javascript:alert(1)', currency: '€' });
        expect(q.symbol).toBe('Mixed');
        expect(q).not.toHaveProperty('yearHigh');
        expect(q).not.toHaveProperty('yearLow');
        expect(q).not.toHaveProperty('volume');
        expect(q).not.toHaveProperty('url');
        expect(q.currency).toBe('EUR');
    });
});

describe('precision and direction', () => {
    it('writes each price with the decimals it needs', () => {
        const d = (price: number, currency?: string) => digitsOf({ price, ...(currency ? { currency } : {}) });
        expect(d(182.5)).toBe(2);
        expect(d(182.523)).toBe(2);
        expect(d(2845, 'JPY')).toBe(0);
        expect(d(2845.5, 'JPY')).toBe(1);
        expect(d(1.0832)).toBe(4);
        expect(d(1.08321)).toBe(4);
        expect(d(1.5)).toBe(2);
        expect(d(0.5)).toBe(2);
        expect(d(0.12345678)).toBe(4);
        expect(d(0.00001234)).toBe(8);
        expect(d(1e-7)).toBe(7);
        expect(d(5, 'XYZ1')).toBe(2);
    });

    it('formats market caps and prices it cannot put a currency on', () => {
        stop = setupStockCard({ tool: 'get_quote', variant: 'compact' });
        const card = draw(call('resolved', { symbol: 'X', price: 0.00001234, marketCap: 1e9 }));
        expect(text(card, '.aparte-stock__row-price')).toBe('0.00001234');
        stop();
        stop = setupStockCard({ tool: 'get_quote' });
        const chart = draw(call('resolved', { symbol: 'X', price: 3, marketCap: 1e9 }));
        expect(text(chart, '.aparte-stock__stat-value')).toBe('1B');
    });

    it('tells which way a quote moved, or nothing when the tool said nothing', () => {
        expect(directionOf({ change: 1 })).toBe('up');
        expect(directionOf({ changePercent: -1 })).toBe('down');
        expect(directionOf({ change: 0 })).toBe('flat');
        expect(directionOf({})).toBeUndefined();
        const q: Quote = { symbol: 'X', price: 1, series: [], candles: [], previousClose: 1, range: '5D' };
        expect(baselineOf(q)).toBeUndefined();
        expect(baselineOf({ ...q, range: ' 1d ' })).toEqual({ value: 1, kind: 'close' });
    });
});

describe('the chart geometry', () => {
    it('places the baseline inside the scale and finds the extremes', () => {
        const g = chartGeometry([2, 4, 3], 1)!;
        expect(g.hi).toBe(1);
        expect(g.lo).toBe(0);
        expect(g.baseY).toBeCloseTo(80);
        expect(g.points[1]).toEqual([50, 20]);
        expect(g.line.startsWith('M0.00 ')).toBe(true);
        expect(g.area.endsWith('L0 80.00 Z')).toBe(true);
        expect(chartGeometry([1], 1)).toBeNull();
        expect(chartGeometry([3, 3], 3)!.baseY).toBe(50);
    });

    it('thins a long series to its width, keeping the first, the last and the extremes', () => {
        const points = Array.from({ length: 1000 }, (_, i) => ({ value: i === 437 ? 9999 : i === 612 ? -9999 : Math.sin(i / 20) }));
        const out = thin(points, 100);
        expect(out.length).toBeLessThanOrEqual(100);
        expect(out[0]).toBe(points[0]);
        expect(out[out.length - 1]).toBe(points[999]);
        expect(out).toContain(points[437]);
        expect(out).toContain(points[612]);
        expect(thin(points.slice(0, 10), 100)).toHaveLength(10);
    });
});

// ── Range buttons (a live card) ─────────────────────────────────────────────

const RANGED = { ...AAPL, ranges: ['1D', '5D', '1M', '6M', '1Y', '5Y'] };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the range buttons', () => {
    it('are drawn only when the app answers a change', () => {
        stop = setupStockCard({ tool: 'get_quote' });
        const card = draw(call('resolved', RANGED));
        expect(card.querySelector('.aparte-stock__ranges, button')).toBeNull();
        // Without buttons, the range is said under the chart.
        expect(text(card, '.aparte-stock__range')).toBe('1 day');
    });

    it('show the ranges over the chart, the one in force pressed: short on the button, in full to a screen reader', () => {
        stop = setupStockCard({ tool: 'get_quote', onChange: () => undefined });
        const card = draw(call('resolved', { ...RANGED, range: '1d' }));
        const group = card.querySelector('.aparte-stock__ranges .aparte-rich-card__segmented')!;
        expect(group.getAttribute('aria-label')).toBe('Range');
        const buttons = [...group.querySelectorAll('button')];
        expect(buttons.map((b) => b.textContent)).toEqual(['1D', '5D', '1M', '6M', '1Y', '5Y']);
        expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['1 day', '5 days', '1 month', '6 months', '1 year', '5 years']);
        expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
        // The pressed button says the range: it is not said again under the chart.
        expect(card.querySelector('.aparte-stock__range')).toBeNull();
        const parts = [...card.querySelector('.aparte-stock--chart')!.children].map((c) => c.classList[0]);
        expect(parts.indexOf('aparte-stock__ranges')).toBe(parts.indexOf('aparte-stock__chart') - 1);
    });

    it('relabel in place in another language, adding no node', () => {
        stop = setupStockCard({ tool: 'get_quote', onChange: () => undefined });
        const renderer = aparteGlobalConfig.getToolRenderer('get_quote')!;
        const card = draw(call('resolved', RANGED));
        const count = card.querySelectorAll('*').length;
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        renderer.relabel!(card, call('resolved', RANGED));
        expect(card.querySelectorAll('*').length).toBe(count);
        const buttons = [...card.querySelectorAll('.aparte-stock__ranges button')];
        expect(buttons.map((b) => b.textContent)).toEqual(['1J', '5J', '1M', '6M', '1A', '5A']);
        expect(buttons[2]!.getAttribute('aria-label')).toMatch(/^1\smois$/u);
        expect(card.querySelector('.aparte-rich-card__segmented')!.getAttribute('aria-label')).toBe('Période');
    });

    it('ask the app for the range, and draw its answer in place: the focus kept, the baseline following', async () => {
        const onChange = vi.fn(async ({ value }: { name: string; value: unknown }, data: StockData) => ({ ...data.quotes[0], range: value, series: [170, 175, 182.52] }));
        stop = setupStockCard({ tool: 'get_quote', onChange });
        const card = draw(call('resolved', RANGED));
        // A day: split at the previous close.
        expect(text(card, '.aparte-stock__legend-text')).toBe('Prev. close 181.29');
        const month = card.querySelector<HTMLButtonElement>('[data-card-key="range:1M"]')!;
        month.focus();
        month.click();
        expect(card.hasAttribute('data-busy')).toBe(true);
        await flush();
        expect(onChange).toHaveBeenCalledWith({ name: 'range', value: '1M' }, expect.objectContaining({ quotes: [expect.objectContaining({ symbol: 'AAPL' })] }));
        expect(document.body.firstElementChild).toBe(card);
        expect(card.hasAttribute('data-busy')).toBe(false);
        const pressed = card.querySelector('[data-card-key="range:1M"]')!;
        expect(document.activeElement).toBe(pressed);
        expect(pressed.getAttribute('aria-pressed')).toBe('true');
        expect(card.querySelector('.aparte-stock__plot')!.getAttribute('aria-label')).toBe('Price chart, 1 month: low 170.00, high 182.52, last 182.52');
        // A month: split where it started, and its move said under it.
        expect(card.querySelector('.aparte-stock__legend')).toBeNull();
        expect(text(card, '.aparte-stock__change--range')).toBe('+7.36%');
        // The figures are the quote's, unchanged.
        expect(text(card, '.aparte-stock__price')).toBe('182.52');
    });

    it('keep a previous close worked back from a percentage out of the figures, after a redraw too', async () => {
        stop = setupStockCard({ tool: 'get_quote', onChange: async ({ value }, data) => ({ ...data.quotes[0], range: value }) });
        const card = draw(call('resolved', { symbol: 'X', price: 110, changePercent: 10, open: 101, series: [100, 110], ranges: ['1D', '1M'] }));
        expect(texts(card, 'dt')).toEqual(['Open']);
        card.querySelector<HTMLButtonElement>('[data-card-key="range:1M"]')!.click();
        await flush();
        expect(card.querySelector('[data-card-key="range:1M"]')!.getAttribute('aria-pressed')).toBe('true');
        expect(texts(card, 'dt')).toEqual(['Open']);
    });

    it('read the ranges a quote offers, without repeats', () => {
        expect(quote({ symbol: 'X', price: 1, ranges: ['1D', '1D', 5, '', null, 'YTD'] }).ranges).toEqual(['1D', '5', 'YTD']);
        expect(quote({ symbol: 'X', price: 1, ranges: [] })).not.toHaveProperty('ranges');
    });
});

// ── Candles ──────────────────────────────────────────────────────────────────

const day = (d: number) => new Date(2026, 9, 26 + d, 10).toISOString();
const CANDLES = [
    { time: day(0), open: 180, high: 184, low: 179, close: 183, volume: 100 },
    { time: day(1), open: 183, high: 185, low: 181, close: 182, volume: 300 },
    { time: day(2), open: 182, high: 182.5, low: 178, close: 182, volume: 50 },
];
const CANDLED = { symbol: 'AAPL', name: 'Apple Inc.', price: 182, currency: 'USD', change: 0.5, range: '5D', candles: CANDLES };

describe('the candles variant', () => {
    beforeEach(() => {
        stop = setupStockCard({ tool: 'get_quote', variant: 'candles' });
    });

    it('draws the chart card with candlesticks: hollow up, filled down, wicks, faint volume, extremes', () => {
        const card = draw(call('resolved', CANDLED));
        expect(card.dataset.variant).toBe('candles');
        expect(card.querySelector('.aparte-stock--chart .aparte-stock__quote')).not.toBeNull();
        const plot = card.querySelector('.aparte-stock__plot')!;
        expect(plot.getAttribute('data-kind')).toBe('candles');
        expect(plot.getAttribute('aria-label')).toBe('Price chart, 5 days: low 178.00, high 185.00, last 182.00');
        const svg = plot.querySelector('svg')!;
        for (const kind of ['body', 'wick', 'volume']) {
            for (const direction of ['up', 'down', 'flat']) {
                expect(svg.querySelectorAll(`.aparte-stock__${kind}--${direction}`)).toHaveLength(1);
            }
        }
        expect(svg.querySelector('.aparte-stock__body--up')!.getAttribute('vector-effect')).toBe('non-scaling-stroke');
        // Each wick is cut at its body: two strokes per candle.
        expect(svg.querySelector('.aparte-stock__wick--up')!.getAttribute('d')!.match(/M/g)).toHaveLength(2);
        expect(text(plot, '.aparte-stock__extreme--hi')).toBe('185.00');
        expect(text(plot, '.aparte-stock__extreme--lo')).toBe('178.00');
        expect(plot.querySelector('.aparte-stock__dot, .aparte-stock__baseline, .aparte-stock__area')).toBeNull();
        expect(text(card, '.aparte-stock__range')).toBe('5 days');
    });

    it('is scrubbed by keyboard and pointer, with an OHLC readout shown short and said in full', () => {
        const card = draw(call('resolved', CANDLED));
        const plot = card.querySelector<HTMLElement>('.aparte-stock__plot')!;
        const shown = () => card.querySelector('.aparte-stock__readout-shown')!.textContent!.replace(/\s/gu, ' ');
        const said = () => card.querySelector('.aparte-stock__readout .aparte-sr-only')!.textContent!.replace(/\s/gu, ' ');
        plot.focus();
        expect(shown()).toMatch(/^O 182\.00 H 182\.50 L 178\.00 C 182\.00 · Wed,? 10:00 AM$/u);
        expect(said()).toMatch(/^Open 182\.00, high 182\.50, low 178\.00, close 182\.00 · Wed,? 10:00 AM$/u);
        plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        expect(shown()).toMatch(/^O 183\.00 H 185\.00 L 181\.00 C 182\.00 · /u);
        plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
        expect(shown()).toMatch(/^O 180\.00 H 184\.00 L 179\.00 C 183\.00 · /u);
        plot.blur();
        plot.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 100, right: 300, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
        // The middle third of the width is the middle candle; the right edge, the last.
        plot.dispatchEvent(new MouseEvent('pointermove', { clientX: 150 }));
        expect(shown()).toMatch(/^O 183\.00 /u);
        plot.dispatchEvent(new MouseEvent('pointermove', { clientX: 300 }));
        expect(shown()).toMatch(/^O 182\.00 /u);
        const cursor = card.querySelector<HTMLElement>('.aparte-stock__cursor')!;
        expect(cursor.style.getPropertyValue('--aparte-stock-x')).toBe(`${(500 / 6).toFixed(2)}%`);
    });

    it('relabels in place, adding no node', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('get_quote')!;
        const card = draw(call('resolved', CANDLED));
        const plot = card.querySelector<HTMLElement>('.aparte-stock__plot')!;
        plot.focus();
        const count = card.querySelectorAll('*').length;
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        renderer.relabel!(card, call('resolved', CANDLED));
        expect(card.querySelectorAll('*').length).toBe(count);
        expect(text(card, '.aparte-stock__extreme--hi')).toBe('185,00');
        expect(plot.getAttribute('aria-label')).toMatch(/^Graphique du cours, 5\sjours : plus bas 178,00, plus haut 185,00, dernier 182,00$/u);
        plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
        expect(card.querySelector('.aparte-stock__readout .aparte-sr-only')!.textContent).toMatch(/^Ouverture 180,00, plus haut 184,00, plus bas 179,00, clôture 183,00 · /u);
    });

    it('falls back to the line chart for a quote without candles, and draws several quotes as rows', () => {
        const line = draw(call('resolved', AAPL));
        expect(line.dataset.variant).toBe('candles');
        expect(line.querySelector('.aparte-stock__plot')!.getAttribute('data-kind')).toBe('line');
        expect(text(line, '.aparte-stock__legend-text')).toBe('Prev. close 181.29');
        expect(draw(call('resolved', [CANDLED, MSFT])).querySelectorAll('.aparte-stock--row')).toHaveLength(2);
        const pending = draw(call('pending', undefined, { symbol: 'AAPL' }));
        expect(pending.querySelector('.aparte-stock--chart.aparte-stock--skeleton .aparte-stock__sk-chart')).not.toBeNull();
    });

    it('draws no extremes for candles that never moved', () => {
        const card = draw(call('resolved', { symbol: 'X', candles: [{ open: 5, high: 5, low: 5, close: 5 }] }));
        expect(card.querySelector('.aparte-stock__plot')!.getAttribute('data-kind')).toBe('candles');
        expect(card.querySelector('.aparte-stock__extreme')).toBeNull();
        expect(card.querySelector('.aparte-stock__volume--flat')).toBeNull();
    });
});

describe('a quote with candles in the other variants', () => {
    it('draws its line from the closes, and takes its last close as its price', () => {
        stop = setupStockCard({ tool: 'get_quote' });
        const q = quote({ symbol: 'X', candles: CANDLES });
        expect(q.price).toBe(182);
        expect(q.series.map((p) => p.value)).toEqual([183, 182, 182]);
        const card = draw(call('resolved', { symbol: 'X', candles: CANDLES }));
        expect(card.querySelector('.aparte-stock__plot')!.getAttribute('data-kind')).toBe('line');
        expect(text(card, '.aparte-stock__price')).toBe('182.00');
        // A series given beside the candles is the line's.
        expect(quote({ symbol: 'X', candles: CANDLES, series: [1, 2] }).series.map((p) => p.value)).toEqual([1, 2]);
    });
});

describe('reading candles', () => {
    it('reads the Yahoo chart answer, whole or one result, its meta as the quote', () => {
        const t0 = 1_730_000_000;
        const result = {
            meta: { symbol: 'AAPL', currency: 'USD', regularMarketPrice: 182.52, chartPreviousClose: 180, exchangeName: 'NMS', range: '1d' },
            timestamp: [t0 + 86_400, t0, t0 + 172_800],
            indicators: { quote: [{ open: [2, 1, 3], high: [2.5, 1.5, 3.5], low: [1.5, 0.5, 2.5], close: [2.2, 1.2, null], volume: [20, 10, 30] }] },
        };
        const data = readQuotes({ chart: { result: [result], error: null } })!;
        const q = data.quotes[0]!;
        expect(q).toMatchObject({ symbol: 'AAPL', price: 182.52, previousClose: 180, exchange: 'NMS', range: '1d', currency: 'USD' });
        expect(q.candles).toHaveLength(2);
        expect(q.candles[0]).toEqual({ time: new Date(t0 * 1000), open: 1, high: 1.5, low: 0.5, close: 1.2, volume: 10 });
        expect(quote(result).candles).toHaveLength(2);
        expect(quote({ symbol: 'AAPL', price: 1, candles: { chart: { result: [result] } } }).candles).toHaveLength(2);
        expect(quote({ symbol: 'AAPL', price: 1, chart: result }).candles).toHaveLength(2);
        expect(quote({ symbol: 'X', price: 1, candles: { timestamp: [1] } }).candles).toEqual([]);
    });

    it('reads Binance klines, numbers written as strings', () => {
        const q = quote({ symbol: 'BTCUSDT', klines: [
            [1_730_003_600_000, '67400.5', '67600', '67300', '67550', '8.1', 1_730_007_199_999, '0', 10, '0', '0', '0'],
            [1_730_000_000_000, '67000.1', '67500', '66800', '67400.5', '12.5', 1_730_003_599_999, '0', 10, '0', '0', '0'],
        ] });
        expect(q.candles[0]).toEqual({ time: new Date(1_730_000_000_000), open: 67000.1, high: 67500, low: 66800, close: 67400.5, volume: 12.5 });
        expect(q.price).toBe(67550);
    });

    it('reads the CoinGecko OHLC answer', () => {
        const q = quote({ symbol: 'btc', ohlc: [[1_730_000_000_000, 67000, 67500, 66800, 67400]] });
        expect(q.candles).toEqual([{ time: new Date(1_730_000_000_000), open: 67000, high: 67500, low: 66800, close: 67400 }]);
        expect(q.symbol).toBe('BTC');
    });

    it('reads { t, o, h, l, c, v } objects, drops a candle missing a price, and never draws one inside out', () => {
        const q = quote({ symbol: 'X', price: 1, bars: [
            { t: '2026-01-02', o: '1', h: 2, l: 0.5, c: 1.5, v: 10 },
            { o: 1, h: 2 },
            { date: '2026-01-03', open: 5, high: 4, low: 6, close: 3, volume: -1 },
            'nope',
        ] });
        expect(q.candles).toHaveLength(2);
        expect(q.candles[0]).toMatchObject({ open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 });
        expect(q.candles[1]).toEqual({ time: new Date(2026, 0, 3), open: 5, high: 6, low: 3, close: 3 });
        expect(quote({ symbol: 'X', price: 1, candles: 'nope' }).candles).toEqual([]);
    });
});

describe('the candle geometry', () => {
    it('draws a rising and a falling candle: body from open to close, wick from low to high', () => {
        const g = candleGeometry([{ open: 1, high: 4, low: 0, close: 3 }, { open: 3, high: 3.5, low: 1, close: 2 }])!;
        const [up, down] = g.shapes;
        expect(up).toMatchObject({ x: 25, width: 31, direction: 'up', high: 16, low: 84, top: 33, bottom: 67, close: 33, volume: 0 });
        expect(down).toMatchObject({ x: 75, direction: 'down', high: 24.5, low: 67, top: 33, bottom: 50, close: 50 });
        // The wick spans the body: the high over its top, the low under its bottom.
        for (const s of g.shapes) {
            expect(s.high).toBeLessThanOrEqual(s.top);
            expect(s.low).toBeGreaterThanOrEqual(s.bottom);
        }
        expect(g.hi).toBe(0);
        expect(g.lo).toBe(0);
        expect(g.volume).toBe(false);
        expect(candleGeometry([])).toBeNull();
    });

    it('keeps a band for the volume along the bottom', () => {
        const g = candleGeometry([{ open: 1, high: 2, low: 0, close: 2, volume: 50 }, { open: 2, high: 2, low: 1, close: 1, volume: 100 }, { open: 1, high: 1, low: 1, close: 1 }])!;
        expect(g.volume).toBe(true);
        expect(g.shapes[0]!.low).toBe(84 - 16);
        expect(g.shapes.map((s) => s.volume)).toEqual([7, 14, 0]);
        expect(g.shapes[2]!.direction).toBe('flat');
        expect(candleGeometry([{ open: 3, high: 3, low: 3, close: 3 }])!.shapes[0]!.top).toBe(50);
    });

    it('merges neighbours into wider candles rather than dropping any', () => {
        const many = Array.from({ length: 200 }, (_, i) => ({ time: new Date(2026, 0, 1, i), open: i, high: i + (i === 77 ? 1000 : 1), low: i - (i === 150 ? 500 : 1), close: i + 0.5, volume: 1 }));
        const out = groupCandles(many);
        expect(out.length).toBeLessThanOrEqual(80);
        expect(out[0]).toEqual({ time: many[0]!.time, open: 0, close: 2.5, high: 3, low: -1, volume: 3 });
        expect(Math.max(...out.map((c) => c.high))).toBe(1077);
        expect(Math.min(...out.map((c) => c.low))).toBe(-350);
        expect(out[out.length - 1]!.close).toBe(199.5);
        expect(groupCandles(many.slice(0, 5))).toHaveLength(5);
        expect(groupCandles([{ open: 1, high: 1, low: 1, close: 1 }, { open: 2, high: 2, low: 2, close: 2 }], 1)).toEqual([{ open: 1, high: 2, low: 1, close: 2 }]);
    });
});

describe('what the audit found', () => {
    beforeEach(() => {
        stop = setupStockCard({ tool: 'get_quote' });
    });

    // From a real `query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1y&interval=1d` answer
    // (2026-10-30): its `chartPreviousClose` is the close before the year began.
    const YAHOO_1Y = {
        meta: {
            currency: 'USD', symbol: 'AAPL', exchangeName: 'NMS', fullExchangeName: 'NasdaqGS', regularMarketTime: 1793390401,
            regularMarketPrice: 344.63, regularMarketChangePercent: -1.227, fiftyTwoWeekHigh: 351.73, fiftyTwoWeekLow: 243.42,
            regularMarketDayHigh: 349.19, regularMarketDayLow: 342.35, regularMarketVolume: 67842804, longName: 'Apple Inc.',
            shortName: 'Apple Inc.', chartPreviousClose: 271.4, priceHint: 2, dataGranularity: '1d', range: '1y',
        },
        timestamp: [1761917400, 1762180200, 1793367000],
        indicators: { quote: [{
            open: [276.989990234375, 270.4200134277344, 346.7200012207031],
            high: [277.32000732421875, 270.8500061035156, 349.19000244140625],
            low: [269.1600036621094, 266.25, 334.3500061035156],
            close: [270.3699951171875, 269.04998779296875, 344.6300048828125],
            volume: [86167100, 50194600, 67797500],
        }] },
    };

    it("over a year, Yahoo's chartPreviousClose is not the day's previous close", () => {
        const q = quote({ chart: { result: [YAHOO_1Y], error: null } });
        // The day moved -1.23 %; the year +73.23. One pill cannot say both.
        expect(q.changePercent).toBe(-1.227);
        expect(q.change).toBeUndefined();
        const card = draw(call('resolved', { chart: { result: [YAHOO_1Y], error: null } }));
        expect(text(card, '.aparte-stock__quote .aparte-stock__change-text')).toBe('-1.23%');
        // Over one day it IS the previous close.
        const day = { ...YAHOO_1Y, meta: { ...YAHOO_1Y.meta, range: '1d', chartPreviousClose: 348.91, regularMarketChangePercent: undefined } };
        expect(quote(day)).toMatchObject({ previousClose: 348.91 });
        expect(quote(day).change).toBeCloseTo(-4.28, 2);
    });

    it('reads a series of epochs in milliseconds as milliseconds, even before 2001', () => {
        // 1999-12-30, 1999-12-31 (both < 10^12 ms), then 2001-09-10 (> 10^12): one series, one unit.
        const t = [946_512_000_000, 946_598_400_000, 1_000_080_000_000];
        const q = quote({ symbol: 'X', series: [[t[2], 3], [t[0], 1], [t[1], 2]] });
        expect(q.series.map((p) => p.value)).toEqual([1, 2, 3]);
        expect(q.series.map((p) => p.time!.getTime())).toEqual(t);
        // A whole series from the nineties, in milliseconds, too: no market traded in the year 31,965.
        const old = quote({ symbol: 'X', series: [{ t: 946_512_000_000, v: 1, value: 1 }, { t: 946_598_400_000, value: 2 }] });
        expect(old.series[0]!.time!.getUTCFullYear()).toBe(1999);
        const candles = quote({ symbol: 'X', klines: [[t[1], 1, 2, 0.5, 1.5], [t[0], 1, 2, 0.5, 1.2]] }).candles;
        expect(candles.map((c) => c.time!.getTime())).toEqual([t[0], t[1]]);
        // Seconds stay seconds.
        expect(quote({ symbol: 'X', series: [[1_730_000_000, 1]] }).series[0]!.time!.getTime()).toBe(1_730_000_000_000);
    });

    it("reads Yahoo's PREPRE and POSTPOST as closed: the extended session is over", () => {
        expect(quote({ symbol: 'X', price: 1, marketState: 'PREPRE' }).marketState).toBe('closed');
        expect(quote({ symbol: 'X', price: 1, marketState: 'POSTPOST' }).marketState).toBe('closed');
        expect(quote({ symbol: 'X', price: 1, marketState: 'PRE' }).marketState).toBe('pre');
        expect(quote({ symbol: 'X', price: 1, marketState: 'POST' }).marketState).toBe('post');
    });

    it('keeps the true extremes of a candle whose high and low were swapped', () => {
        const [c] = quote({ symbol: 'X', candles: [{ time: 1_730_000_000, open: 5, high: 4, low: 6, close: 4.5 }] }).candles;
        expect(c).toMatchObject({ high: 6, low: 4 });
    });

    it('draws the chart as a widget a screen reader passes its keys to, named and described as a chart', () => {
        const plot = draw(call('resolved', AAPL)).querySelector('.aparte-stock__plot')!;
        expect(plot.getAttribute('role')).toBe('application');
        expect(plot.getAttribute('aria-roledescription')).toBe('chart');
        expect(plot.getAttribute('aria-label')).toBe('Price chart, 1 day: low 180.90, high 183.10, last 182.52');
    });
});
