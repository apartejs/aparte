type AgUiEvent = { type: string } & Record<string, unknown>;

/** Negative, zero or positive, as `a` is older than, equal to or newer than `b`. */
function compare(a: readonly number[], b: readonly number[]): number {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] ?? 0) - (b[i] ?? 0);
        if (d !== 0) return d;
    }
    return 0;
}

/**
 * What older AG-UI shapes become before the runner reads them — a middleware, run before
 * anything is stripped, as the protocol requires of a translation:
 *
 * - The retired `THINKING_*` events are always translated into their `REASONING_*`
 *   replacements: a producer may still send them whatever it declares. The span's title
 *   has no place in the replacement, so the translation says so.
 * - A peer of 0.0.57 or older predates subagents: `SUBAGENT_*` events are dropped and
 *   attribution removed, with a warning, rather than read as 1.0 material.
 *
 * `peer` is the configured peer version as numbers; undefined is a 1.0 peer.
 */
export function createTranslator(peer: readonly number[] | undefined, warn: (message: string) => void): (event: AgUiEvent) => AgUiEvent[] {
    const beforeSubagents = peer !== undefined && compare(peer, [0, 0, 57]) <= 0;
    let thought = 0;
    let span: string | undefined;
    let message: string | undefined;
    const warned = new Set<string>();
    const once = (key: string, text: string) => {
        if (warned.has(key)) return;
        warned.add(key);
        warn(text);
    };

    return (event) => {
        switch (event.type) {
            case 'THINKING_START':
                span = `thinking-${++thought}`;
                once('THINKING_START', `translated the retired THINKING_START into REASONING_START${typeof event['title'] === 'string' ? `, dropping its title "${event['title']}"` : ''}; the agent should send REASONING_* events.`);
                return [{ type: 'REASONING_START', messageId: span }];
            case 'THINKING_END': {
                const id = span ?? `thinking-${++thought}`;
                span = undefined;
                return [{ type: 'REASONING_END', messageId: id }];
            }
            case 'THINKING_TEXT_MESSAGE_START':
                message = `thinking-message-${++thought}`;
                return [{ type: 'REASONING_MESSAGE_START', messageId: message, role: 'reasoning' }];
            case 'THINKING_TEXT_MESSAGE_CONTENT':
                return [{ type: 'REASONING_MESSAGE_CONTENT', messageId: message ?? `thinking-message-${thought}`, delta: event['delta'] }];
            case 'THINKING_TEXT_MESSAGE_END': {
                const id = message ?? `thinking-message-${thought}`;
                message = undefined;
                return [{ type: 'REASONING_MESSAGE_END', messageId: id }];
            }
        }
        if (beforeSubagents) {
            if (event.type.startsWith('SUBAGENT_')) {
                once(event.type, `dropping ${event.type}: the agent's AG-UI version predates subagents (0.0.57 or older).`);
                return [];
            }
            if ('subagentRunId' in event) {
                const { subagentRunId: _dropped, ...rest } = event;
                return [rest as AgUiEvent];
            }
        }
        return [event];
    };
}
