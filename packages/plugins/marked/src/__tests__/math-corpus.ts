/**
 * What a maths-aware Markdown provider must make of each input: the formulas, in order,
 * with their TeX intact and whether each is display maths.
 *
 * One corpus for every provider aparté ships — marked one-shot, marked while it streams,
 * streaming-markdown — because a reply may stream through one and settle through
 * another (the docs do exactly that), and any disagreement between them shows as a
 * formula that flips at the end of the turn. Read the result from the rendered HTML:
 * every `code.language-math`, its text, and whether it carries `math-display`.
 */
export interface MathCase {
    readonly md: string;
    readonly maths: ReadonlyArray<readonly [tex: string, display: boolean]>;
}

export const MATH_CORPUS: readonly MathCase[] = [
    // Prices stay prices.
    { md: '$5 and $10', maths: [] },
    { md: 'It costs $5.', maths: [] },
    { md: 'between $5 and $10 dollars', maths: [] },
    { md: 'price: $3.50, tax $0.20', maths: [] },
    { md: '$ x$', maths: [] },
    { md: '$x $', maths: [] },
    { md: '$x$5', maths: [] },
    // The first `$` gives up at the space; the second opens a formula of its own.
    { md: '$a $b$', maths: [['b', false]] },
    { md: 'escaped \\$x\\$ dollars', maths: [] },

    // Inline maths.
    { md: '$x$', maths: [['x', false]] },
    { md: 'so $a+b$ and $c$.', maths: [['a+b', false], ['c', false]] },
    { md: 'half is $\\frac{1}{2}$.', maths: [['\\frac{1}{2}', false]] },
    { md: 'see \\(a_1 + b_2\\) here', maths: [['a_1 + b_2', false]] },
    { md: '$2^{10}$ bytes', maths: [['2^{10}', false]] },

    // Display maths inside a paragraph, and on a line of its own.
    { md: 'text $$x$$ text', maths: [['x', true]] },
    { md: '$$x^2$$', maths: [['x^2', true]] },
    { md: '\\[x\\]', maths: [['x', true]] },
    { md: '$$\nx^2\n$$', maths: [['x^2', true]] },
    { md: '\\[\ny\n\\]', maths: [['y', true]] },
    { md: 'The formula is\n$$\nE = mc^2\n$$\nafter it.', maths: [['E = mc^2', true]] },

    // TeX survives Markdown.
    { md: '$a*b*c$', maths: [['a*b*c', false]] },
    { md: '$x_1 + y_2$', maths: [['x_1 + y_2', false]] },
    { md: '$\\{a\\}$', maths: [['\\{a\\}', false]] },
    { md: '$a \\, b$', maths: [['a \\, b', false]] },
    { md: '$a<b$', maths: [['a<b', false]] },
    { md: '$$\n\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}\n$$', maths: [['\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}', true]] },

    // Code wins.
    { md: '`$x$`', maths: [] },
    { md: '```\n$$x$$\n```', maths: [] },
    { md: '`a` then $x$', maths: [['x', false]] },

    // Inside other blocks.
    { md: '- $x$\n- $y$', maths: [['x', false], ['y', false]] },
    { md: '> so $z$', maths: [['z', false]] },
];
