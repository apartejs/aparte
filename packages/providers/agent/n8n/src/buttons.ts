/**
 * A Chat node's buttons, answered in the page.
 *
 * The runner hands them over as a call the page answers — the shape a browser tool has
 * (`run-suspended`, reason `external`) — so the turn waits for the click the way it waits
 * for any answer only the page can give, and goes on when it comes. `setupN8nButtons`
 * registers what answers it: the buttons, asked at the composer with their own labels
 * through core's `requestUserInput`, and a transcript line that says which was chosen.
 */
import { aparteGlobalConfig, requestUserInput } from '@aparte/core';
import type { AparteConfig, AparteToolCallSegment } from '@aparte/core';

/** The name the runner gives a Chat node's buttons, and `setupN8nButtons` answers. */
export const N8N_BUTTONS_TOOL = 'n8n_buttons';

/** What the runner puts in the call: the question, and its buttons in n8n's order. */
export interface N8nButtonsInput {
    text: string;
    buttons: { text: string; type: string }[];
    /** n8n's "Block User Input": the answer has to be a button, with no words instead. */
    blockUserInput: boolean;
}

/**
 * What the person answered: a button, by its place and its label — or words of their own
 * (`written`, `index` -1), which n8n hears as a chat message: the Chat node resumes on it as
 * not approved, with the words as its input.
 */
export interface N8nButtonsResult {
    index: number;
    text: string;
    written?: true;
}

/**
 * Answer a Chat node's buttons in this page: they are asked at the composer, with their
 * labels, and the line in the transcript keeps the one chosen. Call it once, on the config
 * the chat renders with, when the workflow has Chat nodes that wait for an approval.
 *
 * @example
 * setupN8nButtons();
 * new AparteClient({ streamRunner: createN8nRunner({ webhookUrl }) }).start();
 */
export function setupN8nButtons(config: AparteConfig = aparteGlobalConfig): void {
    config.registerTool({
        name: N8N_BUTTONS_TOOL,
        description: 'The buttons of an n8n Chat node that waits for an answer. Answered by the person in the page.',
        inputSchema: { type: 'object', properties: {} },
    }, async (call, signal, context) => {
        const input = call.input as unknown as N8nButtonsInput;
        const answer = await requestUserInput({
            kind: 'approval',
            message: input.text,
            options: input.buttons.map((button, index) => ({
                value: String(index),
                label: button.text,
                tone: button.type === 'secondary' ? 'deny' : 'affirm',
            })),
            // n8n's "Block User Input": a button, or nothing — no words instead.
            freeText: !input.blockUserInput,
            signal,
            ...(context?.target ? { target: context.target } : {}),
        });
        const content = answer.action === 'accept' ? (answer.content as { option?: string; instruction?: string } | undefined) : undefined;
        const written = content?.instruction?.trim();
        if (written && content?.option === undefined) {
            const result: N8nButtonsResult = { index: -1, text: written, written: true };
            return { toolCallId: call.id, content: written, structuredContent: result };
        }
        const index = content?.option === undefined ? -1 : Number(content.option);
        const chosen = input.buttons[index];
        if (!chosen) throw new Error('No button was chosen.');
        const result: N8nButtonsResult = { index, text: chosen.text };
        return { toolCallId: call.id, content: chosen.text, structuredContent: result };
    });
    // The line in the transcript is the answer, quietly: no tool name, no "Done", nothing to open.
    config.registerToolDisplay(N8N_BUTTONS_TOOL, {
        icon: 'messageSquare',
        label: (segment: AparteToolCallSegment) => (typeof segment.result === 'string' && segment.result ? segment.result : input(segment)),
        quiet: true,
        details: false,
    });
}

/** While the buttons wait: the question they answer. */
function input(segment: AparteToolCallSegment): string {
    return (segment.toolCall?.input as Partial<N8nButtonsInput> | undefined)?.text ?? '';
}
