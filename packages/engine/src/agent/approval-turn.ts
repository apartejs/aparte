/**
 * One question at a time: the turnstile a run's gated calls queue on, and how a sub-agent's
 * run queues on its own AND every run above it before it announces a call. Internal to the
 * loop — not re-exported from the package.
 */
import type { StreamApprovalResolver } from './stream-events.js';

/** Hands out one turn at a time, in the order asked; a free turn is handed over at once. */
export type Turnstile = () => (() => void) | Promise<() => void>;

export function createTurnstile(): Turnstile {
    const waiting: Array<() => void> = [];
    let held = false;
    // Handed straight to the next in line, so nobody arriving in between can jump the queue.
    const handOver = (): void => {
        const next = waiting.shift();
        if (next) next();
        else held = false;
    };
    const releaser = (): (() => void) => {
        let released = false;
        return () => {
            if (released) return;
            released = true;
            handOver();
        };
    };
    return () => {
        if (!held) {
            held = true;
            return releaser();
        }
        return new Promise((resolve) => { waiting.push(() => resolve(releaser())); });
    };
}

/**
 * A turn held on two turnstiles: a run's own first, then the run above it. Always in that
 * order, and a run never waits on one of its sub-agents' turnstiles, so no two holders can
 * wait on each other. Given back both at once, the outer one first.
 */
export function chainTurns(own: Turnstile, outer: Turnstile): Turnstile {
    const thenOuter = (releaseOwn: () => void): (() => void) | Promise<() => void> => {
        const next = outer();
        const both = (releaseOuter: () => void) => () => { releaseOuter(); releaseOwn(); };
        return typeof next === 'function' ? both(next) : next.then(both);
    };
    return () => {
        const first = own();
        return typeof first === 'function' ? thenOuter(first) : first.then(thenOuter);
    };
}

/**
 * What a resolver handed to a sub-agent's run carries besides being callable: the turn of the
 * run it asks through, and the way to ask once that turn is held. Behind a symbol: it is how a
 * nested `runStreamAgent` waits for every run above it BEFORE it announces a call, and nothing
 * a caller sets or reads.
 */
const GATE: unique symbol = Symbol('aparte.approvalGate');
export interface ApprovalGate { turn: Turnstile; ask: StreamApprovalResolver }
type GatedResolver = StreamApprovalResolver & { [GATE]?: ApprovalGate };

export function gateOf(resolver: StreamApprovalResolver | undefined): ApprovalGate | undefined {
    return (resolver as GatedResolver | undefined)?.[GATE];
}

/**
 * A resolver that waits its turn: a sub-agent's question, asked through its run's. Called as
 * it is (a loop of the app's own), it takes the turn itself; a nested `runStreamAgent` reads
 * its gate instead, and takes the turn before it announces the call.
 */
export function inTurn(turnstile: Turnstile, resolver: StreamApprovalResolver): StreamApprovalResolver {
    const waits: GatedResolver = async (call, signal) => {
        const turn = turnstile();
        const release = typeof turn === 'function' ? turn : await turn;
        try {
            return await resolver(call, signal);
        } finally {
            release();
        }
    };
    waits[GATE] = { turn: turnstile, ask: resolver };
    return waits;
}

/**
 * A resolver that hands each call through `map` first, keeping the gate of the one it wraps
 * (see {@link inTurn}): how a sub-agent says whose call it asks about without losing its
 * place in the run's line.
 */
export function relayApprovalResolver(
    resolver: StreamApprovalResolver,
    map: (call: Parameters<StreamApprovalResolver>[0]) => Parameters<StreamApprovalResolver>[0],
): StreamApprovalResolver {
    const relayed: GatedResolver = (call, signal) => resolver(map(call), signal);
    const gate = gateOf(resolver);
    if (gate) relayed[GATE] = { turn: gate.turn, ask: (call, signal) => gate.ask(map(call), signal) };
    return relayed;
}
