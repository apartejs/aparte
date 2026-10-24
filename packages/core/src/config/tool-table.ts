/**
 * Values registered per tool, by exact name, by pattern, or for every tool (`'*'`).
 *
 * The tool registries were `Map<string, …>` keyed by the exact name, which gave no
 * spelling to a tool whose name the app does not know in advance (an MCP server's
 * `mcp__github__get_issue`) nor to "every tool I have not described". This is the one
 * lookup they share, so the rule is written once: the exact name, else the first pattern
 * REGISTERED that matches, else `'*'`.
 */
import type { AparteToolMatcher } from '../types/tools.js';

/** Where a value came from: how specifically it names the tool. */
export type ToolMatchLevel = 'exact' | 'pattern' | 'any';

export class ToolTable<T> {
    private readonly exact = new Map<string, T>();
    // Keyed by the pattern's spelling, so two RegExp instances of one pattern are one
    // entry; a Map keeps first-insertion order, which is the order patterns are tried in.
    private readonly patterns = new Map<string, { re: RegExp; value: T }>();
    private any: T | undefined;

    /** The value registered under exactly this matcher — not a resolution. */
    get(match: AparteToolMatcher): T | undefined {
        if (match instanceof RegExp) return this.patterns.get(String(match))?.value;
        return match === '*' ? this.any : this.exact.get(match);
    }

    set(match: AparteToolMatcher, value: T): void {
        if (match instanceof RegExp) {
            const key = String(match);
            const entry = this.patterns.get(key);
            if (entry) entry.value = value;
            else this.patterns.set(key, { re: match, value });
        } else if (match === '*') {
            this.any = value;
        } else {
            this.exact.set(match, value);
        }
    }

    delete(match: AparteToolMatcher): void {
        if (match instanceof RegExp) this.patterns.delete(String(match));
        else if (match === '*') this.any = undefined;
        else this.exact.delete(match);
    }

    /** The value that applies to a tool named `name`, and how specifically it names it. */
    resolve(name: string): { value: T; level: ToolMatchLevel } | undefined {
        const own = this.exact.get(name);
        if (own !== undefined) return { value: own, level: 'exact' };
        // `search`, not `test`: it ignores `lastIndex`, so a `g` flag cannot make every
        // other lookup miss.
        for (const { re, value } of this.patterns.values()) {
            if (name.search(re) !== -1) return { value, level: 'pattern' };
        }
        return this.any !== undefined ? { value: this.any, level: 'any' } : undefined;
    }

    clear(): void {
        this.exact.clear();
        this.patterns.clear();
        this.any = undefined;
    }
}
