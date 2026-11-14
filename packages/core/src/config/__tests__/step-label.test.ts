/**
 * How a step is called on screen: a key the server sends, the words the page shows.
 *
 * A server streams `step-start { name }` with a stable key (`slot-wait`, `restore`, `reread`);
 * the page knows the person's language. `registerStepLabel` maps a key to what is shown — text,
 * or a function of the locale — and `getStepLabel` answers for a name: the label, or `undefined`
 * so that the caller shows the name itself, as it always did. Core never makes a label up.
 *
 * It follows the tool displays' rules: one table per config, and the function it returns takes
 * the label off again.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteConfig, APARTE_DEFAULT_LOCALE, type AparteStepLabelContext } from '../index.js';

const FR = { ...APARTE_DEFAULT_LOCALE, tag: 'fr-FR' };
const inFrench = ({ locale }: AparteStepLabelContext): string =>
    locale.tag === 'fr-FR' ? 'Reprise de la mémoire…' : 'Restoring the memory…';

describe('registerStepLabel', () => {
    it('a name nobody labelled has no label: the caller shows the name', () => {
        expect(new AparteConfig().getStepLabel('reread')).toBeUndefined();
    });

    it('answers the text registered for the name, and for that name only', () => {
        const config = new AparteConfig();
        config.registerStepLabel('reread', 'Re-reading the conversation');
        expect(config.getStepLabel('reread')).toBe('Re-reading the conversation');
        expect(config.getStepLabel('restore')).toBeUndefined();
    });

    it('trims what it answers, as the tool row trims a label', () => {
        const config = new AparteConfig();
        config.registerStepLabel('reread', '  Re-reading  ');
        expect(config.getStepLabel('reread')).toBe('Re-reading');
    });

    it('a function is told the name and the config\'s locale, and follows a language switch', () => {
        const config = new AparteConfig();
        const label = vi.fn(inFrench);
        config.registerStepLabel('restore', label);

        expect(config.getStepLabel('restore')).toBe('Restoring the memory…');
        config.setLocale(FR);
        expect(config.getStepLabel('restore')).toBe('Reprise de la mémoire…');
        expect(label).toHaveBeenLastCalledWith({ locale: FR, name: 'restore' });
        config.resetLocale();
        expect(config.getStepLabel('restore')).toBe('Restoring the memory…');
    });

    it('one function can serve several names, told which one asked', () => {
        const config = new AparteConfig();
        const words: Record<string, string> = { 'slot-wait': 'Waiting for a free slot', restore: 'Restoring the memory' };
        const label = ({ name }: AparteStepLabelContext): string => words[name] ?? '';
        config.registerStepLabel('slot-wait', label);
        config.registerStepLabel('restore', label);
        expect(config.getStepLabel('slot-wait')).toBe('Waiting for a free slot');
        expect(config.getStepLabel('restore')).toBe('Restoring the memory');
    });

    it('the function it returns takes the label off, and the name is shown again', () => {
        const config = new AparteConfig();
        const off = config.registerStepLabel('reread', 'Re-reading');
        expect(config.getStepLabel('reread')).toBe('Re-reading');
        off();
        expect(config.getStepLabel('reread')).toBeUndefined();
    });

    it('registering a name again replaces its label, and a remover takes back only its own', () => {
        const config = new AparteConfig();
        const first = config.registerStepLabel('reread', 'One');
        const second = config.registerStepLabel('reread', 'Two');
        expect(config.getStepLabel('reread')).toBe('Two');
        first();
        expect(config.getStepLabel('reread'), 'the replaced registration cannot undo its successor').toBe('Two');
        second();
        expect(config.getStepLabel('reread')).toBeUndefined();
    });

    it('tells the components already on the page, once per change, so a showing step is relabelled', () => {
        const config = new AparteConfig();
        const heard = vi.fn();
        config.subscribe(heard);
        const off = config.registerStepLabel('reread', 'Re-reading');
        expect(heard).toHaveBeenCalledTimes(1);
        off();
        off();
        expect(heard, 'taking it off twice says nothing the second time').toHaveBeenCalledTimes(2);
    });

    it('a label that says nothing, or throws, costs the step its label and nothing else', () => {
        const config = new AparteConfig();
        config.registerStepLabel('blank', '   ');
        config.registerStepLabel('empty', () => '');
        config.registerStepLabel('boom', () => { throw new Error('boom'); });
        config.registerStepLabel('number', (() => 42) as never);
        for (const name of ['blank', 'empty', 'boom', 'number']) expect(config.getStepLabel(name), name).toBeUndefined();
    });

    it('reset() forgets every label, and a remover from before it does not undo one added after', () => {
        const config = new AparteConfig();
        const off = config.registerStepLabel('reread', 'Re-reading');
        config.reset();
        expect(config.getStepLabel('reread')).toBeUndefined();
        config.registerStepLabel('reread', 'Again');
        off();
        expect(config.getStepLabel('reread')).toBe('Again');
    });

    it('is a table of the config it is registered on, as the tool displays are', () => {
        const page = new AparteConfig();
        const chat = new AparteConfig();
        page.registerStepLabel('reread', 'The page\'s');
        chat.registerStepLabel('reread', 'The chat\'s');
        expect(page.getStepLabel('reread')).toBe('The page\'s');
        expect(chat.getStepLabel('reread')).toBe('The chat\'s');
        chat.reset();
        expect(page.getStepLabel('reread'), 'resetting one config leaves another alone').toBe('The page\'s');
    });
});
