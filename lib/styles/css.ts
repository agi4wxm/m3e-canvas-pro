/* The CSS a custom style may write, as data: a rule is a selector and its declarations, and both are checked against a
 * small grammar before they are written into a stylesheet. A built-in pack's CSS is trusted, since it ships with the app;
 * a custom style comes from a document, a file, a link or a model, so what it says is held to what a style needs and
 * nothing more:
 *
 *   selectors  only named parts and states: `[data-*]` and `[aria-*]` attribute selectors, `*` after a space, the
 *              combinators ` `, `>`, `+` and `~`, the pseudo-classes in PSEUDOS, `:is()`, `:where()`, `:not()` and
 *              `:has()` over the same grammar, and last `::before`, `::after` or `::placeholder`. Or `&` alone: the
 *              style's scope itself. No classes, ids, element names or structural pseudo-classes (`:first-child`…):
 *              a style dresses a component by the parts it names, never by how it happens to be built.
 *   properties those in PROPERTIES, and custom properties (`--name`).
 *   values     words, numbers, units, `#hex`, and the functions in FUNCTIONS (colors, gradients, math, filters,
 *              transforms, clip-path shapes), balanced; quoted strings only in `content` and `font-family`. Never
 *              `url()` or any other function that loads something, `!important`, a backslash, a comment, or any of
 *              `; { } < > @ :` that would end the declaration or the rule.
 *
 * Every rule a custom style writes comes inside its scope, after the recipes and the pack it extends, as a built-in
 * pack's own CSS does (see sheet.ts), so it reaches the canvas, the preview, the gallery and an exported app alike. */

/** what a custom style writes, one rule at a time */
export type CssRule = { selector: string; declarations: Record<string, string> };

/** why a rule or a declaration was left out, in the two languages the editor and a model read */
export type Reason = { zh: string; en: string };
const why = (zh: string, en: string): Reason => ({ zh, en });

/** the states a rule may single a part out in */
export const PSEUDOS = ["hover", "active", "focus", "focus-visible", "focus-within", "checked", "disabled", "enabled", "indeterminate", "placeholder-shown"] as const;
const PSEUDO_SET = new Set<string>(PSEUDOS);
/** the pseudo-classes that take a selector list of the same grammar */
const PSEUDO_FNS = new Set(["is", "where", "not", "has"]);
/** what may be drawn on a part that it does not have */
const ELEMENTS = new Set(["before", "after", "placeholder"]);

const SIDES = ["top", "right", "bottom", "left"];
const LOGICAL = ["inline", "block", "inline-start", "inline-end", "block-start", "block-end"];
const expand = (base: string, parts: string[]) => parts.map((p) => `${base}-${p}`);

/** the properties a custom style may set: how a part is painted, edged, shadowed, spaced, sized, set in type and
 *  arranged, and what an SVG part is stroked with. Nothing that reaches outside the part (`position: fixed`), nothing
 *  that takes a picture from elsewhere, nothing that changes how the page behaves. */
export const PROPERTIES = new Set<string>([
  /* colors and backgrounds */
  "color", "background", "background-color", "background-image", "background-size", "background-position", "background-position-x", "background-position-y", "background-repeat", "background-origin", "background-clip", "background-blend-mode",
  "-webkit-background-clip", "-webkit-text-fill-color", "-webkit-text-stroke", "-webkit-text-stroke-width", "-webkit-text-stroke-color",
  "opacity", "mix-blend-mode", "isolation", "accent-color", "caret-color",
  /* edges */
  "border", "border-width", "border-style", "border-color", "border-radius",
  ...SIDES.flatMap((s) => [`border-${s}`, `border-${s}-width`, `border-${s}-style`, `border-${s}-color`]),
  ...LOGICAL.flatMap((s) => [`border-${s}`, `border-${s}-width`, `border-${s}-style`, `border-${s}-color`]),
  "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "border-start-start-radius", "border-start-end-radius", "border-end-start-radius", "border-end-end-radius",
  "border-image", "border-image-source", "border-image-slice", "border-image-width", "border-image-outset", "border-image-repeat",
  "outline", "outline-width", "outline-style", "outline-color", "outline-offset",
  /* shadows and effects */
  "box-shadow", "text-shadow", "filter", "backdrop-filter", "-webkit-backdrop-filter", "clip-path",
  "mask", "mask-image", "mask-size", "mask-position", "mask-repeat", "mask-mode", "-webkit-mask", "-webkit-mask-image", "-webkit-mask-size", "-webkit-mask-position", "-webkit-mask-repeat",
  "transform", "transform-origin", "translate", "rotate", "scale",
  /* spacing and size */
  "padding", ...expand("padding", [...SIDES, ...LOGICAL]), "margin", ...expand("margin", [...SIDES, ...LOGICAL]),
  "gap", "row-gap", "column-gap",
  "width", "height", "min-width", "min-height", "max-width", "max-height", "inline-size", "block-size", "min-inline-size", "min-block-size", "max-inline-size", "max-block-size", "aspect-ratio", "box-sizing",
  /* type */
  "font", "font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-variant", "font-variant-numeric", "font-variant-caps", "font-feature-settings", "font-synthesis", "font-synthesis-weight",
  "line-height", "letter-spacing", "word-spacing", "text-transform", "text-align", "text-decoration", "text-decoration-line", "text-decoration-color", "text-decoration-style", "text-decoration-thickness", "text-underline-offset", "text-overflow", "white-space", "text-wrap", "vertical-align",
  /* composition: a hook shown or hidden, the order of a part's pieces */
  "display", "flex", "flex-direction", "flex-wrap", "flex-flow", "flex-grow", "flex-shrink", "flex-basis", "order",
  "align-items", "align-self", "align-content", "justify-content", "justify-items", "justify-self", "place-items", "place-content", "place-self",
  "grid-template-columns", "grid-template-rows", "grid-auto-flow", "grid-column", "grid-row",
  "overflow", "overflow-x", "overflow-y", "position", "top", "right", "bottom", "left", "inset", "inset-inline", "inset-block", "z-index", "visibility", "content", "object-fit", "object-position",
  /* SVG parts */
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-opacity",
  /* motion: what the app's own keyframes are played as */
  "transition", "transition-property", "transition-duration", "transition-timing-function", "transition-delay",
  "animation", "animation-name", "animation-duration", "animation-timing-function", "animation-delay", "animation-iteration-count", "animation-direction", "animation-fill-mode", "animation-play-state",
  "scrollbar-width", "scrollbar-color",
]);

/** the functions a value may call: colors, gradients, math, filters, transforms and the shapes of a clip-path. None of
 *  them loads anything. */
export const FUNCTIONS = new Set<string>([
  "var", "calc", "min", "max", "clamp",
  "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color-mix",
  "linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient", "repeating-radial-gradient", "repeating-conic-gradient",
  "polygon", "inset", "circle", "ellipse",
  "drop-shadow", "blur", "brightness", "contrast", "saturate", "grayscale", "sepia", "hue-rotate", "invert", "opacity",
  "translate", "translatex", "translatey", "translatez", "translate3d", "rotate", "rotatex", "rotatey", "rotatez", "scale", "scalex", "scaley", "skew", "skewx", "skewy", "perspective",
  "cubic-bezier", "steps", "repeat", "minmax", "fit-content",
]);

const DISPLAYS = new Set(["none", "flex", "inline-flex", "block", "inline", "inline-block", "grid", "inline-grid", "contents"]);
const POSITIONS = new Set(["static", "relative", "absolute", "sticky"]);
/** the most a style needs to write: past this a rule is not a style's */
export const LIMITS = { rules: 600, selector: 4000, value: 2000, declarations: 80, depth: 4, content: 16 };

/** Whether a value can be written as it is, or why not. The property decides what more it is held to. */
export function checkValue(prop: string, raw: string): Reason | null {
  const value = raw.trim();
  if (!value) return why("值是空的", "the value is empty");
  if (value.length > LIMITS.value) return why(`值超过 ${LIMITS.value} 个字符`, `the value is longer than ${LIMITS.value} characters`);
  /* said first, by name, since an address would otherwise be refused only for its colon */
  const fetches = /(?:^|[^-a-z0-9])((?:-webkit-)?image-set|url|image|element|cross-fade|paint|src|expression)\s*\(/i.exec(value);
  if (fetches) return why(`${fetches[1]}() 会从别处取东西，不允许`, `${fetches[1]}() fetches something from elsewhere and is not allowed`);
  // eslint-disable-next-line no-control-regex -- control characters are among what a value may never carry
  if (/[;{}<>@\\!`:=[\]^|?$&]|\/\*|\*\/|[\u0000-\u001f\u007f]/.test(value.replace(/"[^"]*"|'[^']*'/g, '""'))) return why("值里有不允许的字符（; { } < > @ \\ ! : 等）", "the value has a character a value may not have (; { } < > @ \\ ! : …)");
  /* strings: only where a style needs words or a face's name, short, and with nothing that would end them */
  const strings = value.match(/"[^"]*"|'[^']*'/g) ?? [];
  if (strings.length) {
    if (prop !== "content" && prop !== "font-family" && prop !== "font") return why("只有 content 和 font-family 可以写引号里的文字", "only content and font-family may hold quoted words");
    for (const s of strings) if (/["'\\<>{};\n\r]/.test(s.slice(1, -1)) || s.length - 2 > 64) return why("引号里的文字太长或有不允许的字符", "a quoted string is too long or has a character it may not have");
  }
  /* the value with every string taken out: a quote left is one that was not closed */
  const bare = value.replace(/"[^"]*"|'[^']*'/g, "s");
  if (/["']/.test(bare)) return why("引号没有成对", "a quote is not closed");
  /* every function is one that draws, and the parentheses close */
  let depth = 0;
  for (let i = 0; i < bare.length; i++) {
    const c = bare[i];
    if (c === "(") {
      const name = /([-a-zA-Z0-9]*)$/.exec(bare.slice(0, i))?.[1].toLowerCase() ?? "";
      if (name && !FUNCTIONS.has(name)) return name === "url" || name.endsWith("image-set") || name === "image" || name === "element" || name === "expression" ? why(`${name}() 会从别处取东西，不允许`, `${name}() fetches something from elsewhere and is not allowed`) : why(`不认识函数 ${name}()`, `${name}() is not a function a style may call`);
      if (++depth > 8) return why("括号套得太深", "the parentheses nest too deep");
    } else if (c === ")" && --depth < 0) return why("括号没有成对", "a parenthesis is not opened");
  }
  if (depth !== 0) return why("括号没有成对", "a parenthesis is not closed");
  if (/(^|[^-a-z])(url|expression|javascript)\b/i.test(bare)) return why("值里提到 url、expression 或 javascript", "the value names url, expression or javascript");
  const word = value.toLowerCase();
  if (prop === "position" && !POSITIONS.has(word)) return why("position 只能是 static、relative、absolute 或 sticky", "position may only be static, relative, absolute or sticky");
  if (prop === "display" && !DISPLAYS.has(word)) return why(`display 只能是 ${[...DISPLAYS].join("、")}`, `display may only be ${[...DISPLAYS].join(", ")}`);
  if (prop === "z-index" && !(word === "auto" || (/^-?\d+$/.test(word) && Math.abs(Number(word)) <= 100))) return why("z-index 只能是 -100 到 100 的整数", "z-index may only be a whole number from -100 to 100");
  if (prop === "content" && !(word === "none" || word === "normal" || /^("[^"]*"|'[^']*')$/.test(value))) return why("content 只能是一段引号里的文字、none 或 normal", "content may only be one quoted string, none or normal");
  if (prop === "content" && value.length - 2 > LIMITS.content) return why(`content 的文字最多 ${LIMITS.content} 个字符`, `content may hold at most ${LIMITS.content} characters`);
  return null;
}

/** whether a property may be set at all */
export function checkProperty(prop: string): Reason | null {
  if (/^--[a-zA-Z0-9_-]{1,64}$/.test(prop)) return null;
  if (PROPERTIES.has(prop)) return null;
  return why(`不允许设置属性 ${prop}`, `${prop} is not a property a style may set`);
}

/* ---------- selectors ---------- */

type Cursor = { s: string; i: number };
const at = (c: Cursor) => c.s[c.i];
const skipWs = (c: Cursor) => {
  const from = c.i;
  while (c.i < c.s.length && /\s/.test(c.s[c.i])) c.i++;
  return c.i > from;
};
const nameAt = (c: Cursor) => {
  const m = /^-?[a-zA-Z][a-zA-Z0-9-]*/.exec(c.s.slice(c.i));
  if (!m) return "";
  c.i += m[0].length;
  return m[0];
};

function attribute(c: Cursor): Reason | null {
  c.i++;
  skipWs(c);
  const name = nameAt(c).toLowerCase();
  if (!/^(data|aria)-[a-z0-9-]+$/.test(name)) return why(`只能按 data-* 或 aria-* 属性选择，不能按 [${name}]`, `only data-* and aria-* attributes may be selected, not [${name}]`);
  skipWs(c);
  if (at(c) === "]") return (c.i++, null);
  const op = /^[~|^$*]?=/.exec(c.s.slice(c.i))?.[0];
  if (!op) return why(`[${name}] 后面的写法不对`, `[${name}] is not followed by a comparison`);
  c.i += op.length;
  skipWs(c);
  const q = at(c);
  if (q === '"' || q === "'") {
    const end = c.s.indexOf(q, c.i + 1);
    if (end < 0) return why("属性值的引号没有成对", "the quote around an attribute value is not closed");
    const v = c.s.slice(c.i + 1, end);
    if (v.length > 100 || /["'\\[\]<>{};\n\r]/.test(v)) return why("属性值太长或有不允许的字符", "an attribute value is too long or has a character it may not have");
    c.i = end + 1;
  } else {
    const m = /^[a-zA-Z0-9_-]+/.exec(c.s.slice(c.i));
    if (!m) return why(`[${name}${op}…] 的值不对`, `the value of [${name}${op}…] is not a word`);
    c.i += m[0].length;
  }
  skipWs(c);
  if (/^[is]\s*\]/i.test(c.s.slice(c.i))) {
    c.i++;
    skipWs(c);
  }
  if (at(c) !== "]") return why("属性选择器没有用 ] 结束", "an attribute selector is not closed with ]");
  c.i++;
  return null;
}

/** one compound: what it is anchored to (a named part, `*`, or `:is`/`:where` of some), and its states */
function compound(c: Cursor, depth: number, after: string | null): { reason: Reason | null; element: boolean } {
  let parts = 0;
  let anchored = false;
  let element = false;
  const fail = (reason: Reason) => ({ reason, element });
  for (;;) {
    const ch = at(c);
    if (ch === "*") {
      if (after !== " ") return fail(why("* 只能跟在空格后面，表示“里面的任何部位”", "* may only follow a space, as anything inside"));
      c.i++;
      parts++;
      anchored = true;
    } else if (ch === "[") {
      if (element) return fail(why("::before/::after 之后不能再写别的", "nothing may follow ::before or ::after"));
      const r = attribute(c);
      if (r) return fail(r);
      parts++;
      anchored = true;
    } else if (ch === ":") {
      if (element) return fail(why("::before/::after 之后不能再写别的", "nothing may follow ::before or ::after"));
      const isElement = c.s[c.i + 1] === ":";
      c.i += isElement ? 2 : 1;
      const name = nameAt(c).toLowerCase();
      if (isElement || name === "before" || name === "after") {
        if (!ELEMENTS.has(name)) return fail(why(`不允许 ::${name}`, `::${name} is not allowed`));
        element = true;
        parts++;
      } else if (PSEUDO_FNS.has(name)) {
        if (at(c) !== "(") return fail(why(`:${name} 后面要有括号`, `:${name} takes a selector in parentheses`));
        if (depth >= LIMITS.depth) return fail(why("选择器套得太深", "the selector nests too deep"));
        c.i++;
        const inner = list(c, depth + 1, name === "has");
        if (inner) return fail(inner);
        if (at(c) !== ")") return fail(why(`:${name}( 没有用 ) 结束`, `:${name}( is not closed`));
        c.i++;
        parts++;
        if (name === "is" || name === "where") anchored = true;
      } else if (PSEUDO_SET.has(name)) {
        if (at(c) === "(") return fail(why(`:${name} 不带括号`, `:${name} takes no parentheses`));
        parts++;
      } else return fail(why(`不允许 :${name}：只能按部位的名字和状态（${PSEUDOS.join("、")}）选择，不能按结构`, `:${name} is not allowed: select parts by name and state (${PSEUDOS.join(", ")}), never by structure`));
    } else break;
  }
  if (!parts) {
    const ch = at(c);
    if (ch === ".") return fail(why("不能按类名选择，请用 data-slot 等属性", "classes may not be selected: use data-slot and other data-* attributes"));
    if (ch === "#") return fail(why("不能按 id 选择", "ids may not be selected"));
    if (ch && /[a-zA-Z]/.test(ch)) return fail(why(`不能按元素名（${nameAt({ s: c.s, i: c.i })}）选择，请用 data-slot`, `element names (${nameAt({ s: c.s, i: c.i })}) may not be selected: use data-slot`));
    return fail(why(ch ? `这里不能出现“${ch}”` : "选择器不完整", ch ? `"${ch}" is not expected here` : "the selector is incomplete"));
  }
  /* inside :is(), :where(), :not() and :has() a compound may only narrow down what the outer one named */
  if (!anchored && depth === 0) return fail(why("先说是哪个部位：以 [data-…]、:is(…) 或 * 开头", "say which part first: start with [data-…], :is(…) or *"));
  return { reason: null, element };
}

function complex(c: Cursor, depth: number, relative: boolean): Reason | null {
  skipWs(c);
  let after: string | null = null;
  if (relative && /[>+~]/.test(at(c) ?? "")) {
    after = at(c);
    c.i++;
    skipWs(c);
  }
  for (;;) {
    const { reason, element } = compound(c, depth, after);
    if (reason) return reason;
    const spaced = skipWs(c);
    const ch = at(c);
    if (ch === undefined || ch === "," || ch === ")") return null;
    if (element) return why("::before/::after 必须在选择器的最后", "::before and ::after must come last in a selector");
    if (ch === ">" || ch === "+" || ch === "~") {
      after = ch;
      c.i++;
      skipWs(c);
    } else if (spaced) after = " ";
    else return why(`这里不能出现“${ch}”`, `"${ch}" is not expected here`);
  }
}

function list(c: Cursor, depth: number, relative: boolean): Reason | null {
  for (;;) {
    const r = complex(c, depth, relative);
    if (r) return r;
    skipWs(c);
    if (at(c) !== ",") return null;
    c.i++;
  }
}

/** Whether a selector is one a custom style may write, or why not. `&` alone is the style's scope itself. */
export function checkSelector(raw: string): Reason | null {
  const s = raw.trim();
  if (!s) return why("选择器是空的", "the selector is empty");
  if (s.length > LIMITS.selector) return why(`选择器超过 ${LIMITS.selector} 个字符`, `the selector is longer than ${LIMITS.selector} characters`);
  if (s === "&") return null;
  // eslint-disable-next-line no-control-regex -- control characters are among what a selector may never carry
  if (/[;{}<>\\@!`]|\/\*|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s.replace(/>/g, " "))) return why("选择器里有不允许的字符（; { } \\ @ 等）", "the selector has a character it may not have (; { } \\ @ …)");
  const c: Cursor = { s, i: 0 };
  const r = list(c, 0, false);
  if (r) return r;
  if (c.i < s.length) return why(`“${s.slice(c.i, c.i + 12)}”写法不对`, `"${s.slice(c.i, c.i + 12)}" cannot be read`);
  return null;
}

/** a selector or a value as it is written out: its runs of white space made one */
export const tidyCss = (s: string) => s.trim().replace(/\s+/g, " ");

/** the rules as CSS, one to a line, in the order given */
export const rulesCss = (rules: CssRule[]) =>
  rules
    .map((r) => `${r.selector}{${Object.entries(r.declarations).map(([p, v]) => `${p}:${v}`).join(";")}}`)
    .join("\n");

/* ---------- reading CSS back into rules ---------- */

/** a rule as a stylesheet writes it, before it is checked: its declarations in order, repeats and all */
export type ParsedRule = { selector: string; declarations: [string, string][] };

/** cuts `s` at `sep` where it stands outside quotes, parentheses and brackets */
function cut(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

/** Reads a flat stylesheet (rules, no at-rules, no nesting) into its rules. What cannot be read as one comes back in
 *  `unread`; nothing is checked here. */
export function parseCss(css: string): { rules: ParsedRule[]; unread: string[] } {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: ParsedRule[] = [];
  const unread: string[] = [];
  let i = 0;
  while (i < text.length) {
    let depth = 0;
    let quote = "";
    let open = -1;
    let j = i;
    for (; j < text.length; j++) {
      const c = text[j];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (c === "{" && depth === 0) {
        if (open >= 0) break;
        open = j;
      } else if (c === "}" && depth === 0) break;
    }
    if (open < 0 || text[j] !== "}") {
      const rest = text.slice(i).trim();
      if (rest) unread.push(rest);
      break;
    }
    const selector = tidyCss(text.slice(i, open));
    const body = text.slice(open + 1, j);
    if (selector.startsWith("@") || !selector) unread.push(text.slice(i, j + 1).trim());
    else
      rules.push({
        selector,
        declarations: cut(body, ";")
          .map((d) => d.trim())
          .filter(Boolean)
          .map((d) => {
            const k = d.indexOf(":");
            return [d.slice(0, k).trim(), tidyCss(d.slice(k + 1))] as [string, string];
          }),
      });
    i = j + 1;
  }
  return { rules, unread };
}

/** Checks one rule as data: what of it can be written, and what was left out and why. A declaration that fails is
 *  dropped on its own; a selector that fails drops the rule. */
export function checkRule(rule: unknown): { rule: CssRule | null; dropped: { what: string; reason: Reason }[] } {
  const dropped: { what: string; reason: Reason }[] = [];
  if (typeof rule !== "object" || rule === null) return { rule: null, dropped: [{ what: "rule", reason: why("规则要写成 { selector, declarations }", "a rule is { selector, declarations }") }] };
  const r = rule as Record<string, unknown>;
  const selector = typeof r.selector === "string" ? tidyCss(r.selector) : "";
  const bad = checkSelector(selector);
  if (bad) return { rule: null, dropped: [{ what: "selector", reason: bad }] };
  const given = Array.isArray(r.declarations) ? (r.declarations as unknown[]).filter((d): d is [string, string] => Array.isArray(d) && d.length === 2) : typeof r.declarations === "object" && r.declarations !== null ? Object.entries(r.declarations as Record<string, unknown>) : [];
  const declarations: Record<string, string> = {};
  for (const [rawProp, rawValue] of given.slice(0, LIMITS.declarations)) {
    const prop = String(rawProp).trim().toLowerCase().startsWith("--") ? String(rawProp).trim() : String(rawProp).trim().toLowerCase();
    if (typeof rawValue !== "string" && typeof rawValue !== "number") {
      dropped.push({ what: prop, reason: why("值要写成文字", "the value is not text") });
      continue;
    }
    const value = tidyCss(String(rawValue));
    const reason = checkProperty(prop) ?? checkValue(prop, value);
    if (reason) dropped.push({ what: prop, reason });
    else declarations[prop] = value;
  }
  if (given.length > LIMITS.declarations) dropped.push({ what: "declarations", reason: why(`一条规则最多 ${LIMITS.declarations} 项`, `a rule holds at most ${LIMITS.declarations} declarations`) });
  if (!Object.keys(declarations).length) return { rule: null, dropped: dropped.length ? dropped : [{ what: "declarations", reason: why("规则里没有可用的声明", "the rule has nothing left to say") }] };
  return { rule: { selector, declarations }, dropped };
}

/** A stylesheet as the rules a custom style may write: every rule, when all of it fits the grammar; otherwise what
 *  did not fit, and why. A declaration said twice in one rule does not fit: as data a rule says each property once. */
export function rulesFromCss(css: string): { rules: CssRule[]; rejected: { selector: string; what: string; reason: Reason }[] } {
  const { rules: parsed, unread } = parseCss(css);
  const rules: CssRule[] = [];
  const rejected: { selector: string; what: string; reason: Reason }[] = unread.map((u) => ({ selector: u.slice(0, 60), what: "rule", reason: why("读不懂这段 CSS", "this CSS cannot be read as rules") }));
  for (const p of parsed) {
    const props = p.declarations.map(([k]) => k);
    const twice = props.find((k, i) => props.indexOf(k) !== i);
    if (twice) {
      rejected.push({ selector: p.selector, what: twice, reason: why(`${twice} 在一条规则里写了两次`, `${twice} is said twice in one rule`) });
      continue;
    }
    const { rule, dropped } = checkRule(p);
    for (const d of dropped) rejected.push({ selector: p.selector, ...d });
    if (rule && !dropped.length) rules.push(rule);
  }
  return { rules, rejected };
}
