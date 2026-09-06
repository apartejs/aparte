/**
 * A `when` scenario that calls a tool needs its `after` counterpart (#cowork-3).
 *
 * Perfectly plausible to write — `when` plus a turn containing a tool — and the
 * default match then routes the tool RESULT back through the same `when`: the
 * conversation eats its own tail, ten identical rounds, then the client's
 * maxTurns error. On a scripted provider that is confusing; pointed at a paid
 * model it burns money. The provider can SEE the hole at creation, so it says so.
 *
 * Ordered `turns` mode is exempt (every call advances, a tool round-trip included). A
 * custom `match` is NOT: it does not replace the default rule, it precedes it —
 * `match(...) ?? defaultMatch(...)` — so a `match` that returns `undefined` for the tool
 * result, which is exactly what the docs' and the examples' own `match` functions do,
 * falls straight into the loop this warning describes. The exemption used to be there and
 * silenced the one shape most likely to hit it.
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

    it('still warns under a custom match — `match` precedes the default rule, it does not replace it', () => {
        // `match(request, scenarios) ?? defaultMatch(request, scenarios)`: a `match` that
        // returns undefined for the tool result — the shape the docs and the examples write —
        // lands back on the rule the warning protects.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createScenarioProvider({
            match: () => undefined,
            scenarios: {
                weather: { when: 'weather', turn: [{ tool: 'get_weather', input: {} }] },
            },
        });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toContain('get_weather');
    });

    it('warns for a match that always returns a key too — one line a consumer who owns the routing can ignore', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createScenarioProvider({
            match: () => 'weather',
            scenarios: {
                weather: { when: 'weather', turn: [{ tool: 'get_weather', input: {} }] },
            },
        });
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('tells a caller who passed a match that the line may be theirs to ignore', () => {
        // The docs' own "Branching on what the user answered" example is this shape: no
        // `after:` route, a `match` that reads the tool result and routes it by value. The
        // sentence about looping is false FOR IT, so the warning has to name the escape it
        // cannot see — otherwise the reader is told their working code is broken.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createScenarioProvider({
            match: (request, scenarios) => {
                const last = [...request.messages].reverse().find((m) => m.role === 'tool');
                if (!last) return 'start';
                const picked = String(last.content).trim();
                return picked in scenarios ? picked : undefined;
            },
            scenarios: {
                start: { turn: [{ tool: 'ask_user', input: {} }] },
                browser: { turn: 'In the browser, then.' },
            },
        });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toContain('this line is the one to ignore');
    });

    it('claims nothing about `match` when there is none — the loop is unconditional there', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createScenarioProvider({
            scenarios: {
                weather: { when: 'weather', turn: [{ tool: 'get_weather', input: {} }] },
            },
        });
        expect(String(warn.mock.calls[0]?.[0])).not.toContain('this line is the one to ignore');
    });
});
