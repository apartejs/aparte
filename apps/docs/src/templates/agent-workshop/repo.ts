/**
 * The repository the agent works in: spanwise, a small, fictional TypeScript library that reads
 * human durations ("1h 30m") as milliseconds. Its files live in memory, and `runTests` plays the
 * part of the test runner, so the tools (tools.ts) behave like real ones: a fix the agent writes
 * is what makes the next run pass.
 *
 * The bug the agent is asked about, issue #42: `parse('1.5h')` returns one hour, because the
 * amount goes through `parseInt`, which stops at the decimal point.
 */

export type Files = Map<string, string>;

const PARSE = `/**
 * parse() — a human duration ("1h 30m", "90s", "1.5h") to milliseconds.
 */
import { UNITS, type Unit } from './units';

/** An amount and its unit, with optional space between: \`90s\`, \`1.5h\`, \`2 d\`. */
const TOKEN = /(\\d+(?:\\.\\d+)?)\\s*(ms|s|m|h|d)/g;

export function parse(input: string): number {
    const text = input.trim().toLowerCase();
    if (text === '') throw new RangeError('Empty duration');

    let total = 0;
    const rest = text.replace(TOKEN, (_, amount: string, unit: Unit) => {
        total += parseInt(amount, 10) * UNITS[unit];
        return '';
    });

    if (rest.trim() !== '') throw new RangeError(\`Cannot read "\${input}"\`);
    return total;
}
`;

const FORMAT = `/**
 * format() — milliseconds to the shortest human form: 5_400_000 → "1h 30m".
 */
import { UNITS } from './units';

const ORDER = ['d', 'h', 'm', 's', 'ms'] as const;

export function format(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) throw new RangeError(\`Cannot format \${ms}\`);
    if (ms === 0) return '0s';

    const parts: string[] = [];
    let rest = ms;
    for (const unit of ORDER) {
        const count = Math.floor(rest / UNITS[unit]);
        if (count > 0) parts.push(\`\${count}\${unit}\`);
        rest -= count * UNITS[unit];
    }
    return parts.join(' ');
}
`;

const UNITS_FILE = `/** Milliseconds in one of each unit spanwise reads and writes. */
export const UNITS = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
} as const;

export type Unit = keyof typeof UNITS;
`;

const INDEX = `export { parse } from './parse';
export { format } from './format';
export { UNITS, type Unit } from './units';
`;

const PARSE_TEST = `import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';

describe('parse', () => {
    it('reads a single unit', () => {
        expect(parse('90s')).toBe(90_000);
    });
    it('adds several units', () => {
        expect(parse('1h 30m')).toBe(5_400_000);
    });
    it('reads decimal amounts', () => {
        expect(parse('1.5h')).toBe(5_400_000);
    });
    it('ignores case and spaces', () => {
        expect(parse(' 2 D ')).toBe(172_800_000);
    });
    it('throws on an empty string', () => {
        expect(() => parse('')).toThrow(RangeError);
    });
    it('throws on an unknown unit', () => {
        expect(() => parse('3 weeks')).toThrow(RangeError);
    });
});
`;

const FORMAT_TEST = `import { describe, expect, it } from 'vitest';
import { format } from '../src/format';
import { parse } from '../src/parse';

describe('format', () => {
    it('writes the largest units first', () => {
        expect(format(5_400_000)).toBe('1h 30m');
    });
    it('writes zero as 0s', () => {
        expect(format(0)).toBe('0s');
    });
    it('keeps milliseconds', () => {
        expect(format(1_250)).toBe('1s 250ms');
    });
    it('throws on a negative duration', () => {
        expect(() => format(-1)).toThrow(RangeError);
    });
    it('round-trips with parse', () => {
        expect(format(parse('2d 4h'))).toBe('2d 4h');
    });
});
`;

const PACKAGE = `{
  "name": "spanwise",
  "version": "0.4.1",
  "description": "Human durations to milliseconds and back.",
  "type": "module",
  "exports": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^3.2.0"
  },
  "license": "MIT"
}
`;

const README = `# spanwise

Human durations to milliseconds and back. No dependencies.

    import { parse, format } from 'spanwise';

    parse('1h 30m');    // 5400000
    format(5_400_000);  // '1h 30m'

Units: ms, s, m, h, d. Amounts may be decimal: parse('1.5h').
`;

/** The repository as the branch stands before the agent touches it, in the order the tree lists it. */
export function initialFiles(): Files {
    return new Map([
        ['src/format.ts', FORMAT],
        ['src/index.ts', INDEX],
        ['src/parse.ts', PARSE],
        ['src/units.ts', UNITS_FILE],
        ['tests/format.test.ts', FORMAT_TEST],
        ['tests/parse.test.ts', PARSE_TEST],
        ['package.json', PACKAGE],
        ['README.md', README],
    ]);
}

/** The highlighter's name for a file's language. */
export function languageOf(path: string): string {
    if (path.endsWith('.ts')) return 'typescript';
    if (path.endsWith('.json')) return 'json';
    return 'text';
}

interface TestFile {
    path: string;
    tests: string[];
    /** The test that fails while `parse` still truncates decimals, if this file has one. */
    decimalTest?: string;
}

const SUITES: TestFile[] = [
    {
        path: 'tests/format.test.ts',
        tests: ['writes the largest units first', 'writes zero as 0s', 'keeps milliseconds', 'throws on a negative duration', 'round-trips with parse'],
    },
    {
        path: 'tests/parse.test.ts',
        tests: ['reads a single unit', 'adds several units', 'reads decimal amounts', 'ignores case and spaces', 'throws on an empty string', 'throws on an unknown unit'],
        decimalTest: 'reads decimal amounts',
    },
];

/**
 * What `pnpm test [file]` prints for the files as they are. The decimal test passes once
 * `src/parse.ts` no longer reads the amount with `parseInt`.
 */
export function runTests(files: Files, only?: string): string {
    const fixed = !files.get('src/parse.ts')?.includes('parseInt(amount');
    const suites = SUITES.filter((s) => !only || s.path === only);
    if (suites.length === 0) return `No test files found, exiting with code 1\nfilter: ${only}`;

    const lines = ['', `> spanwise@0.4.1 test`, `> vitest run${only ? ` ${only}` : ''}`, ''];
    let failed = 0;
    let passed = 0;
    for (const suite of suites) {
        const failing = !fixed && suite.decimalTest ? suite.decimalTest : undefined;
        const count = suite.tests.length;
        lines.push(failing ? ` ❯ ${suite.path} (${count} tests | 1 failed) 7ms` : ` ✓ ${suite.path} (${count} tests) 5ms`);
        for (const test of suite.tests) {
            if (test === failing) {
                lines.push(`   × ${test}`, '     → expected 3600000 to be 5400000');
                failed++;
            } else {
                if (failing) lines.push(`   ✓ ${test}`);
                passed++;
            }
        }
    }
    if (failed > 0) {
        lines.push(
            '',
            ' FAIL  tests/parse.test.ts > parse > reads decimal amounts',
            'AssertionError: expected 3600000 to be 5400000',
            '',
            ' ❯ tests/parse.test.ts:12:31',
            "     11|     it('reads decimal amounts', () => {",
            "     12|         expect(parse('1.5h')).toBe(5_400_000);",
            '       |                               ^',
        );
    }
    const failedFiles = failed > 0 ? 1 : 0;
    lines.push(
        '',
        ` Test Files  ${tally(failedFiles, suites.length - failedFiles)}`,
        `      Tests  ${tally(failed, passed)}`,
        `   Duration  ${380 + 40 * suites.length}ms`,
    );
    return lines.join('\n');
}

/** "1 failed | 5 passed (6)", the runner's summary line. */
function tally(failed: number, passed: number): string {
    const parts = [failed ? `${failed} failed` : '', passed ? `${passed} passed` : ''].filter(Boolean);
    return `${parts.join(' | ')} (${failed + passed})`;
}
