/**
 * An event detail an app builds itself still compiles after a release adds a field to it.
 *
 * A test, or a host that re-dispatches `aparte-tool-approval-request`, writes the detail by
 * hand. A field added as required to it breaks that code on upgrade, though core always sets
 * it. The assertions here are the TYPES: `pnpm typecheck:tests` compiles this file.
 */
import { describe, it, expect } from 'vitest';
import type { AparteToolApprovalRequestDetail } from '../types/index.js';

describe('AparteToolApprovalRequestDetail', () => {
    it('is built with the fields it had before the turn was added to it', () => {
        const detail: AparteToolApprovalRequestDetail = { toolCallId: 'c1', toolName: 'search', input: { q: 'x' } };
        expect(detail.messageId).toBeUndefined();
    });
});
