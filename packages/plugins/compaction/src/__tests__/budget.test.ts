/**
 * The budget, and nothing else: since 0.16.0 the engine's compactor answers one
 * question — how much of the window is left for the conversation — and the selector
 * walks the history against it. The assembler and its RAG slot were removed with their
 * tests; they had no caller.
 */
import { describe, it, expect } from 'vitest';
import {
    estimateTokens,
    estimateTokensJson,
    computeHistoryBudget,
    splitHistoryBudget,
    DEFAULT_COMPACTION_CONFIG,
} from '../budget.js';

describe('estimateTokens', () => {
    it('is 0 for empty / nullish input', () => {
        expect(estimateTokens('')).toBe(0);
        expect(estimateTokens(null)).toBe(0);
        expect(estimateTokens(undefined)).toBe(0);
    });

    it('uses the ~3.8 chars/token heuristic (ceil)', () => {
        expect(estimateTokens('a'.repeat(38))).toBe(10);
        expect(estimateTokens('a'.repeat(39))).toBe(11);
    });

    it('estimateTokensJson serialises then estimates; 0 for nullish and for what JSON cannot serialise', () => {
        expect(estimateTokensJson(null)).toBe(0);
        expect(estimateTokensJson({ a: 1 })).toBe(estimateTokens('{"a":1}'));
        const circular: Record<string, unknown> = {};
        circular['self'] = circular;
        expect(estimateTokensJson(circular)).toBe(0);
    });
});

describe('computeHistoryBudget', () => {
    it('subtracts system + tools + reservations + buffer + margin from the window', () => {
        const systemPrompt = 'x'.repeat(380); // 100 tokens
        const tools = [{ name: 'a'.repeat(72) }];
        const { historyBudget, breakdown } = computeHistoryBudget({
            systemPrompt,
            toolsArray: tools,
            config: { contextWindow: 10_000, reservedThinking: 500, reservedGeneration: 1000, autocompactBufferPct: 0.1, safetyMargin: 100, minHistoryBudget: 1 },
        });
        const expected = 10_000 - 100 - breakdown.tools - 500 - 1000 - 1000 - 100;
        expect(breakdown.systemPrompt).toBe(100);
        expect(breakdown.autocompactBuffer).toBe(1000);
        expect(historyBudget).toBe(expected);
        expect(breakdown.historyAvailable).toBe(expected);
    });

    it('never goes below minHistoryBudget on a tiny window', () => {
        const { historyBudget } = computeHistoryBudget({
            systemPrompt: 'x'.repeat(4000),
            config: { contextWindow: 512, minHistoryBudget: 1000 },
        });
        expect(historyBudget).toBe(1000);
    });

    it('carries the merged config back, defaults filled in', () => {
        const { config } = computeHistoryBudget({ systemPrompt: '', config: { contextWindow: 4096 } });
        expect(config.contextWindow).toBe(4096);
        expect(config.summaryMaxTokens).toBe(DEFAULT_COMPACTION_CONFIG.summaryMaxTokens);
    });
});

describe('splitHistoryBudget', () => {
    it('caps the summary and gives the rest to the window', () => {
        const split = splitHistoryBudget(1000, { ...DEFAULT_COMPACTION_CONFIG, summaryRatio: 0.1, summaryMaxTokens: 400 });
        expect(split).toEqual({ summary: 100, window: 900 });
    });

    it('respects the hard cap on a large budget', () => {
        const split = splitHistoryBudget(100_000, { ...DEFAULT_COMPACTION_CONFIG, summaryRatio: 0.1, summaryMaxTokens: 400 });
        expect(split).toEqual({ summary: 400, window: 99_600 });
    });
});
