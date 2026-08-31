/**
 * A `when` scenario that calls a tool needs its `after` counterpart (#cowork-3).
 *
 * Perfectly plausible to write — `when` plus a turn containing a tool — and the
 * default match then routes the tool RESULT back through the same `when`: the
 * conversation eats its own tail, ten identical rounds, then the client's
 * maxTurns error. On a scripted provider that is confusing; pointed at a paid
 * model it burns money. The provider can SEE the hole at creation, so it says so.
 *
 * Ordered `turns` mode is exempt (every call advances, a tool round-trip
 * included), and a custom `match` replaces the default rule entirely.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createScenarioProvider } from '../index.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('a tool-calling scenario without its after route warns at creation', () => {
    it('warns once, naming the tool and the missing route', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createScenarioProvider({
            scenarios: {
                weather: { when: 'weather', turn: [{ text: 'Let me check.' }, { tool: 'get_weather', input: {} }] },
            },
        });
        expect(warn).toHaveBeenCalledTimes(1);
        const msg = String(warn.mock.calls[0]?.[0]);
        expect(msg).toContain('get_weather');
        expect(msg).toContain('after');
    });

    it('stays silent when the after route exists', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createScenarioProvider({
            scenarios: {
                weather: { when: 'weather', turn: [{ tool: 'get_weather', input: {} }] },
                forecast: { after: 'get_weather', turn: 'Cloudy, 14 °C.' },
            },
        });
        expect(warn).not.toHaveBeenCalled();
    });

    it('stays silent in ordered turns mode — every call advances on its own', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createScenarioProvider({ turns: [[{ tool: 'step', input: {} }], 'done'] });
        expect(warn).not.toHaveBeenCalled();
    });

    it('stays silent under a custom match — the default rule is not in play', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createScenarioProvider({
            match: () => 'weather',
            scenarios: {
                weather: { when: 'weather', turn: [{ tool: 'get_weather', input: {} }] },
            },
        });
        expect(warn).not.toHaveBeenCalled();
    });
});
