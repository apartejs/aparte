/**
 * A plural form out of `"one:{n} tool|other:{n} tools"`, by the locale's own rules: Russian
 * has four forms and Japanese one, so the string carries what its language needs, each named
 * by its `Intl.PluralRules` category. `other` is the form to fall back on.
 */
export function pluralize(forms: string, n: number, tag?: string): string {
    let category: string = 'other';
    try {
        category = new Intl.PluralRules(tag).select(n);
    } catch {
        // A tag the engine rejects still gets a form.
    }
    const options = forms.split('|');
    const named = (name: string) => options.find((form) => form.startsWith(`${name}:`));
    const form = named(category) ?? named('other') ?? forms;
    return form.slice(form.indexOf(':') + 1).replace('{n}', String(n));
}
