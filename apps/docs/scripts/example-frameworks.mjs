/**
 * One HTML example, shown in the five ways a consumer would actually write it.
 *
 * The pages used to be vanilla end to end, with a single "In a framework" section at the
 * bottom showing one synthetic tag. So a React reader read HTML for the whole page and got
 * one line in their own syntax, at the end, about an element they had already stopped
 * reading about.
 *
 * **Four of the five outputs are the SAME STRING.** That is not laziness, it is the
 * library's thesis made checkable: a custom element is markup, so Vue, Svelte and Angular
 * take the tag verbatim, and only React needs a transform — because JSX is not HTML, not
 * because the element differs. If a future change makes three of these diverge, that
 * divergence is the news.
 */

/** HTML attributes JSX spells differently. Deliberately short: this is markup, not React. */
const JSX_ATTR = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex' };

/** Void elements, which JSX requires to be self-closed. */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** `flex: 1; max-width: 30rem` → `{{ flex: 1, maxWidth: '30rem' }}` */
function styleToJsx(css) {
  const props = css
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const i = d.indexOf(':');
      if (i === -1) return null;
      const name = d.slice(0, i).trim().replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
      const value = d.slice(i + 1).trim();
      // A bare number stays a number, as React itself would write it; anything with a
      // unit or a keyword is a string. `0` is a number too, which is why this tests the
      // whole value rather than truthiness.
      return `${name}: ${/^-?\d+(\.\d+)?$/.test(value) ? value : `'${value.replace(/'/g, "\\'")}'`}`;
    })
    .filter(Boolean);
  return `{{ ${props.join(', ')} }}`;
}

/**
 * Rewrite one tag's attribute string for JSX, walking it token by token.
 *
 * A regex over the whole string cannot do this: it has to tell a bare attribute from a
 * word inside a quoted value, and `placeholder="Ask anything…"` contains two.
 *
 * **A bare presence attribute becomes `=""`, and that is the load-bearing part.** Left
 * bare, JSX reads `streaming` as `{true}` and React renders `streaming="true"` — which
 * happens to work, but contradicts what every framework guide on this site teaches, and
 * the neighbouring value `{false}` renders `streaming="false"`, which `hasAttribute` reads
 * as ON. Generating an example that argues with the guide beside it is worse than
 * generating none.
 */
function rewriteAttrs(attrs) {
  let out = '';
  let i = 0;
  while (i < attrs.length) {
    const ws = /^\s+/.exec(attrs.slice(i));
    if (ws) { out += ws[0]; i += ws[0].length; continue; }
    const name = /^[a-zA-Z][\w:-]*/.exec(attrs.slice(i));
    if (!name) { out += attrs[i]; i += 1; continue; }
    i += name[0].length;
    const jsxName = JSX_ATTR[name[0]] ?? name[0];
    const value = /^\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/.exec(attrs.slice(i));
    if (!value) { out += `${jsxName}=""`; continue; }
    i += value[0].length;
    const raw = value[1];
    const unquoted = /^["']/.test(raw) ? raw.slice(1, -1) : raw;
    out += name[0] === 'style' ? `style=${styleToJsx(unquoted)}` : `${jsxName}="${unquoted}"`;
  }
  return out;
}

/**
 * HTML → JSX.
 *
 * Attribute values are otherwise left alone: `max-height="320"` stays exactly that,
 * because React passes an unknown attribute through to a custom element verbatim, which
 * is the whole reason the tag is identical in the other four.
 */
export function toJsx(html) {
  return html
    // Comments first: their content must not be seen by the attribute rules below.
    .replace(/<!--([\s\S]*?)-->/g, (_m, body) => `{/*${body}*/}`)
    .replace(/<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/g, (_m, tag, attrs, selfClose) => {
      const close = selfClose || VOID.has(tag.toLowerCase()) ? ' /' : '';
      return `<${tag}${rewriteAttrs(attrs)}${close}>`;
    });
}

/**
 * `frame="none"`, because the preview card already IS the frame.
 *
 * Expressive Code wraps every block in its own bordered figure with a caption bar. Nested
 * inside a card that has a border, a header and a tab row, that is a second frame around
 * the same content — two rules, two paddings, for one code block.
 *
 * (I first justified this line by claiming the caption bar appeared on four panes and not
 * on React's. It does not: the caption is emitted empty for all five. The uneven thing on
 * that card was the selected button's box, which is a style problem in the component.)
 */
const fence = (lang, code) => `\n\`\`\`${lang} frame="none"\n${code}\n\`\`\`\n`;
const indent = (s, by) => s.split('\n').map((l) => (l ? by + l : l)).join('\n');

/**
 * One example in each framework, keyed by the slot `<ElementPreview>` expects.
 *
 * Not Starlight `<Tabs>`: the preview card puts its tab row ABOVE the frame and its panes
 * below, and a Starlight tab group renders row and panels together. The card owns the
 * switching, and remembers the choice for the whole site the way `syncKey` would.
 */
export function exampleInFrameworks(htmlExamples, scriptExamples = []) {
  const joinHtml = (render) => htmlExamples.map(render).join('');
  const script = scriptExamples.map((e) => fence('ts', e)).join('');
  return {
    vanilla: joinHtml((e) => fence('html', e)) + script,
    react: joinHtml((e) => fence('tsx', toJsx(e))) + script,
    vue: joinHtml((e) => fence('vue', `<template>\n${indent(e, '  ')}\n</template>`)) + script,
    svelte: joinHtml((e) => fence('svelte', e)) + script,
    angular: joinHtml((e) => fence('html', e)) + script,
  };
}
