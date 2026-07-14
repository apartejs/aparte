import { describe, it, expect } from 'vitest';
import { parseToolCalls } from '../pythonic-parser';

describe('parseToolCalls — Pythonic (LFM2.5 native)', () => {
    it('parses a bare pythonic call', () => {
        expect(parseToolCalls('[get_weather(city="Paris")]')).toEqual([
            { name: 'get_weather', args: { city: 'Paris' } },
        ]);
    });

    it('parses a call wrapped in tool_call_start/end markers', () => {
        const text = '<|tool_call_start|>[get_weather(city="Paris")]<|tool_call_end|>';
        expect(parseToolCalls(text)).toEqual([{ name: 'get_weather', args: { city: 'Paris' } }]);
    });

    it('does not stop at parens inside a string value', () => {
        // The whole reason the char-walker exists — the naive regex broke here.
        const calls = parseToolCalls('[run_code(code="foo(1, 2)")]');
        expect(calls).toHaveLength(1);
        expect(calls[0]!.args['code']).toBe('foo(1, 2)');
    });

    it('coerces number / boolean / null argument types', () => {
        const calls = parseToolCalls('[cfg(n=42, ratio=1.5, on=true, off=false, empty=null)]');
        expect(calls[0]!.args).toEqual({ n: 42, ratio: 1.5, on: true, off: false, empty: null });
    });

    it('handles single-quoted strings', () => {
        expect(parseToolCalls("[say(text='hello')]")[0]!.args['text']).toBe('hello');
    });

    it('unescapes \\n \\t and escaped quotes inside strings', () => {
        const calls = parseToolCalls('[w(s="a\\nb\\t\\"c\\"")]');
        expect(calls[0]!.args['s']).toBe('a\nb\t"c"');
    });

    it('parses several tool calls in one response', () => {
        const calls = parseToolCalls('[a(x=1)][b(y="z")]');
        expect(calls).toEqual([
            { name: 'a', args: { x: 1 } },
            { name: 'b', args: { y: 'z' } },
        ]);
    });

    it('is case-sensitive on tool names (mis-cased is not captured)', () => {
        expect(parseToolCalls('[GetWeather(city="Paris")]')).toEqual([]);
    });

    it('returns [] for empty or tool-free text', () => {
        expect(parseToolCalls('')).toEqual([]);
        expect(parseToolCalls('just a normal answer')).toEqual([]);
    });
});

describe('parseToolCalls — Hermes JSON fallback', () => {
    it('parses a Hermes tool_call when no pythonic call is present', () => {
        const text = '<tool_call>{"name": "get_weather", "arguments": {"city": "Paris"}}</tool_call>';
        expect(parseToolCalls(text)).toEqual([{ name: 'get_weather', args: { city: 'Paris' } }]);
    });

    it('accepts string-encoded arguments and the `parameters` alias', () => {
        const text = '<tool_call>{"name": "x", "parameters": "{\\"a\\": 1}"}</tool_call>';
        expect(parseToolCalls(text)).toEqual([{ name: 'x', args: { a: 1 } }]);
    });

    it('skips malformed Hermes JSON', () => {
        expect(parseToolCalls('<tool_call>{ not json }</tool_call>')).toEqual([]);
    });

    it('prefers pythonic over Hermes when both are present', () => {
        const text = '[a(x=1)] <tool_call>{"name":"b","arguments":{}}</tool_call>';
        expect(parseToolCalls(text)).toEqual([{ name: 'a', args: { x: 1 } }]);
    });
});
