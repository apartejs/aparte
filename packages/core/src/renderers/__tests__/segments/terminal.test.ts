/**
 * The terminal renderer and the Run affordance a host must declare first.
 *
 * One of the eleven files the old 844-line `segment-renderers.test.ts` became.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
    getSegmentRenderer,
    registerDefaultRenderers
} from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';

// Register the default renderers once, so the built-in under test is resolvable.
registerDefaultRenderers();

describe('default renderer: terminal', () => {
    afterEach(() => aparteGlobalConfig.reset());

    it('is registered', () => {
        expect(getSegmentRenderer('terminal')).toBeDefined();
    });

    it('renders the escaped command and the terminal icon', () => {
        const renderer = getSegmentRenderer('terminal')!;
        const html = renderer.render({ id: 'term1', type: 'terminal', command: 'echo <hi>' } as any);
        expect(html).toContain('class="terminal-command"');
        expect(html).toContain('&lt;hi&gt;');
        expect(html).not.toContain('echo <hi>');
    });

    it('shows a running indicator (no run button) while isRunning is true', () => {
        const renderer = getSegmentRenderer('terminal')!;
        const html = renderer.render({ id: 'term2', type: 'terminal', command: 'ls', isRunning: true } as any);
        expect(html).toContain('terminal-running');
        expect(html).not.toContain('terminal-run-btn');
    });

    // Core cannot run a command — only the app can, by handling
    // `aparte-terminal-run`. So the Run button waits for the app to say so.
    it('renders NO run button until the app declares terminalRun', () => {
        const renderer = getSegmentRenderer('terminal')!;
        const html = renderer.render({ id: 'term3', type: 'terminal', command: 'ls' } as any);
        expect(html).not.toContain('terminal-run-btn');
        expect(html).not.toContain('terminal-running');
        // Copy stays: core honors it on its own.
        expect(html).toContain('terminal-copy-btn');
    });

    it('shows a run button (no running indicator) once terminalRun is declared', () => {
        aparteGlobalConfig.setHostHandlers({ terminalRun: true });
        const renderer = getSegmentRenderer('terminal')!;
        const html = renderer.render({ id: 'term3b', type: 'terminal', command: 'ls' } as any);
        expect(html).toContain('terminal-run-btn');
        expect(html).not.toContain('terminal-running');
    });

    it('renders the escaped output block only when output is present', () => {
        const renderer = getSegmentRenderer('terminal')!;
        const withOutput = renderer.render({ id: 'term4', type: 'terminal', command: 'ls', output: '<b>listing</b>' } as any);
        expect(withOutput).toContain('class="terminal-output"');
        expect(withOutput).toContain('&lt;b&gt;listing&lt;/b&gt;');

        const withoutOutput = renderer.render({ id: 'term5', type: 'terminal', command: 'ls' } as any);
        expect(withoutOutput).not.toContain('terminal-output');
    });

    it('shows a failure message for a non-zero exit code', () => {
        const renderer = getSegmentRenderer('terminal')!;
        const html = renderer.render({ id: 'term6', type: 'terminal', command: 'false', exitCode: 1 } as any);
        expect(html).toContain('class="terminal-error"');
        expect(html).toContain('Command failed with exit code 1');
    });

    it('does not show a failure message for exit code 0', () => {
        const renderer = getSegmentRenderer('terminal')!;
        const html = renderer.render({ id: 'term7', type: 'terminal', command: 'true', exitCode: 0 } as any);
        expect(html).not.toContain('terminal-error');
    });

    it('does not show a failure message when exitCode is undefined', () => {
        const renderer = getSegmentRenderer('terminal')!;
        const html = renderer.render({ id: 'term8', type: 'terminal', command: 'sleep 1' } as any);
        expect(html).not.toContain('terminal-error');
    });

    // The event used to carry a `segmentId` read off a DOM attribute and NOTHING
    // else: a consumer knew a command had been asked for and could not say which
    // turn asked it. Both ids now come off the segment object, which `addSegment`
    // stamps.
    it('the run button reports the message the terminal belongs to', () => {
        aparteGlobalConfig.setHostHandlers({ terminalRun: true });
        const renderer = getSegmentRenderer('terminal')!;
        const segment = {
            id: 'term-run',
            type: 'terminal',
            command: 'ls -la',
            messageId: 'm-77',
            index: 2,
        } as never;

        const host = document.createElement('div');
        host.innerHTML = renderer.render(segment) as string;
        document.body.appendChild(host);
        const el = host.firstElementChild as HTMLElement;
        renderer.setup?.(el, segment);

        const seen: Array<{ segmentId: string; messageId?: string; command: string }> = [];
        document.addEventListener('aparte-terminal-run', (e) => {
            seen.push((e as CustomEvent).detail);
        });

        (el.querySelector('.terminal-run-btn') as HTMLElement).click();

        expect(seen).toHaveLength(1);
        expect(seen[0]!.messageId).toBe('m-77');
        expect(seen[0]!.segmentId).toBe('term-run');
        expect(seen[0]!.command).toBe('ls -la');

        host.remove();
    });
});
