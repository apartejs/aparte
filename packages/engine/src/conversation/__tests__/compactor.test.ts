import { describe, it, expect } from 'vitest';
import {
    estimateTokens,
    estimateTokensJson,
    computeHistoryBudget,
    splitHistoryBudget,
    assembleCompacted,
    compactConversation,
    DEFAULT_COMPACTION_CONFIG,
    type CompactionMessage,
} from '../compactor';

describe('estimateTokens', () => {
    it('is 0 for empty / nullish input', () => {
        expect(estimateTokens('')).toBe(0);
        expect(estimateTokens(null)).toBe(0);
        expect(estimateTokens(undefined)).toBe(0);
    });
    it('uses the ~3.8 chars/token heuristic (ceil)', () => {
        expect(estimateTokens('a'.repeat(38))).toBe(10);
        expect(estimateTokens('a'.repeat(39))).toBe(11); // ceil
    });
    it('estimateTokensJson serialises then estimates; 0 for nullish', () => {
        expect(estimateTokensJson(null)).toBe(0);
        expect(estimateTokensJson({ a: 1 })).toBe(estimateTokens(JSON.stringify({ a: 1 })));
    });
});

describe('computeHistoryBudget', () => {
    it('subtracts system + tools + reservations + buffer + margin from the window', () => {
        const { historyBudget, breakdown } = computeHistoryBudget({
            systemPrompt: 'x'.repeat(380), // ~100 tok
            config: { contextWindow: 8192 },
        });
        expect(breakdown.systemPrompt).toBe(100);
        // 8192 - (100 + 0 + 0 + 2000 + 819 + 500) = 4773
        expect(historyBudget).toBe(8192 - (100 + 2000 + 819 + 500));
    });

    it('never goes below minHistoryBudget on a tiny window', () => {
        const { historyBudget } = computeHistoryBudget({
            systemPrompt: 'x'.repeat(4000),
            config: { contextWindow: 1000, minHistoryBudget: 750 },
        });
        expect(historyBudget).toBe(750);
    });
});

describe('splitHistoryBudget', () => {
    it('caps summary + ragHist and gives the rest to the window', () => {
        const s = splitHistoryBudget(4000, DEFAULT_COMPACTION_CONFIG);
        expect(s.summary).toBe(Math.min(400, 400));   // 4000*0.10=400, cap 400
        expect(s.ragHist).toBe(Math.min(1000, 1000)); // 4000*0.25=1000, cap 1000
        expect(s.window).toBe(4000 - s.summary - s.ragHist);
    });
    it('respects the hard caps on a large budget', () => {
        const s = splitHistoryBudget(100_000, DEFAULT_COMPACTION_CONFIG);
        expect(s.summary).toBe(400);
        expect(s.ragHist).toBe(1000);
    });
});

describe('assembleCompacted — working-memory floor & drops', () => {
    const turns = (n: number): CompactionMessage[] =>
        Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i} ${'x'.repeat(40)}` }));

    it('keeps the last 2 non-system messages verbatim even with a zero window budget', () => {
        const msgs = turns(6);
        const { compactedMessages, dropped } = assembleCompacted({
            messages: msgs, windowBudget: 0, summaryBudget: 0, ragBudget: 0,
        });
        expect(compactedMessages.slice(-2)).toEqual(msgs.slice(-2));
        expect(dropped.oldTurns).toBeGreaterThan(0);
    });

    it('puts systemContent first, then the window', () => {
        const { compactedMessages } = assembleCompacted({
            messages: turns(2), windowBudget: 10_000, summaryBudget: 0, ragBudget: 0,
            systemContent: 'SYS',
        });
        expect(compactedMessages[0]).toEqual({ role: 'system', content: 'SYS' });
    });

    it('includes a summary system message within budget', () => {
        const { compactedMessages, used } = assembleCompacted({
            messages: turns(2), windowBudget: 10_000, summaryBudget: 400, ragBudget: 0,
            summary: 'the user asked about X',
        });
        expect(compactedMessages.some(m => m.role === 'system' && m.content.includes('the user asked about X'))).toBe(true);
        expect(used.summary).toBeGreaterThan(0);
    });

    it('drops the lowest-scoring retrieved turns when the rag budget is tight', () => {
        const { compactedMessages, dropped } = assembleCompacted({
            messages: turns(2), windowBudget: 10_000, summaryBudget: 0, ragBudget: 30,
            retrievedTurns: [
                { role: 'user', content: 'high ' + 'x'.repeat(40), score: 0.9 },
                { role: 'user', content: 'low ' + 'x'.repeat(40), score: 0.1 },
            ],
        });
        const rag = compactedMessages.find(m => m.content.startsWith('Extraits'));
        expect(rag?.content).toContain('high');
        expect(dropped.ragHits).toBeGreaterThan(0);
    });
});

describe('compactConversation — end to end', () => {
    it('assembles a compacted list and a coherent breakdown', () => {
        const messages: CompactionMessage[] = Array.from({ length: 20 }, (_, i) => ({
            role: i % 2 ? 'assistant' : 'user', content: `message ${i} ` + 'lorem '.repeat(30),
        }));
        const { compactedMessages, breakdown } = compactConversation({
            messages, systemPrompt: 'You are Aparte.', config: { contextWindow: 4096 },
        });
        // System prompt is at the head, and the last two turns survive.
        expect(compactedMessages[0]!.role).toBe('system');
        expect(compactedMessages.slice(-2)).toEqual(messages.slice(-2));
        // Budget accounting is populated.
        expect(breakdown.historyAvailable).toBeGreaterThan(0);
        expect(breakdown.totalUsed).toBeGreaterThan(0);
    });
});
