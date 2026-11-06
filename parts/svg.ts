import { h, type PNode, type PValue } from "./node";

/* The vector atom's drawing: a shape from the library, a path, or markup pasted from a design tool.
 * Pasted markup is read by a small parser of its own and rebuilt as a tree of plain SVG elements,
 * keeping only what draws: shapes, groups, gradients, clips and masks, with the attributes that
 * paint them. Everything else is dropped, along with whatever it holds: scripts and styles, event
 * handlers, foreign content, links and pictures from elsewhere. The tree is drawn by React like
 * any other part, never set as HTML, so nothing in the markup runs on the canvas, in the preview or
 * in an exported project. Plain data: no React here.
 *
 * Markup is also something a shared link carries, so a drawing is held to what a drawing needs: it
 * is so many elements, so deep; the names it gives its parts are its own (two drawings both calling
 * a gradient `g` each paint with their own); it points only at parts of itself; and what it reuses
 * (`use`, a mask, a clip, a pattern) may not multiply into more than a drawing's worth of work. */

/** the elements a drawing keeps; anything else goes with what it holds */
const ELEMENTS = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "symbol", "use"]);
/** what says nothing to draw but is harmless: dropped, and its words with it */
const SILENT = new Set(["title", "desc", "metadata"]);
/** what a reference can point at for nothing: a gradient paints, it never draws anything of its own */
const GRADIENTS = new Set(["linearGradient", "radialGradient"]);

/** the attributes kept, by their SVG name, with the name React knows them by */
const ATTRS: Record<string, string> = {
  id: "id",
  d: "d",
  x: "x",
  y: "y",
  x1: "x1",
  y1: "y1",
  x2: "x2",
  y2: "y2",
  cx: "cx",
  cy: "cy",
  r: "r",
  rx: "rx",
  ry: "ry",
  fx: "fx",
  fy: "fy",
  width: "width",
  height: "height",
  points: "points",
  transform: "transform",
  viewBox: "viewBox",
  preserveAspectRatio: "preserveAspectRatio",
  offset: "offset",
  gradientUnits: "gradientUnits",
  gradientTransform: "gradientTransform",
  spreadMethod: "spreadMethod",
  patternUnits: "patternUnits",
  patternContentUnits: "patternContentUnits",
  patternTransform: "patternTransform",
  clipPathUnits: "clipPathUnits",
  maskUnits: "maskUnits",
  maskContentUnits: "maskContentUnits",
  pathLength: "pathLength",
  fill: "fill",
  "fill-opacity": "fillOpacity",
  "fill-rule": "fillRule",
  stroke: "stroke",
  "stroke-width": "strokeWidth",
  "stroke-opacity": "strokeOpacity",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-dasharray": "strokeDasharray",
  "stroke-dashoffset": "strokeDashoffset",
  "stroke-miterlimit": "strokeMiterlimit",
  "clip-path": "clipPath",
  "clip-rule": "clipRule",
  mask: "mask",
  opacity: "opacity",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  "vector-effect": "vectorEffect",
  "shape-rendering": "shapeRendering",
  visibility: "visibility",
  display: "display",
  href: "href",
  "xlink:href": "href",
};

/** the properties a `style` attribute keeps, by their CSS name, with the name React knows them by */
const STYLE: Record<string, string> = {
  fill: "fill",
  "fill-opacity": "fillOpacity",
  "fill-rule": "fillRule",
  stroke: "stroke",
  "stroke-width": "strokeWidth",
  "stroke-opacity": "strokeOpacity",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-dasharray": "strokeDasharray",
  "stroke-dashoffset": "strokeDashoffset",
  "stroke-miterlimit": "strokeMiterlimit",
  opacity: "opacity",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  "clip-rule": "clipRule",
  "mix-blend-mode": "mixBlendMode",
  "vector-effect": "vectorEffect",
};

/** the values that may point at a part of the drawing (`url(#shade)`), by React's name: what paints
 *  (`fill`, `stroke`, which everything inside takes too) and what cuts (`mask`, `clipPath`). Any
 *  other value that names an address goes. */
const PAINTS = new Set(["fill", "stroke"]);
const POINTERS = new Set(["fill", "stroke", "mask", "clipPath"]);

/** the name a drawing gives one of its parts */
const ID = /^[\w.-]{1,128}$/;
/** CSS's own whitespace: anything else in a `url()` is part of the address */
const WS = "[ \\t\\n\\r\\f]*";
/** a reference to a part of the drawing itself, `url(#shade)`, quoted or not; group 2 is the name */
const LOCAL_URL = new RegExp(`url\\(${WS}(['"]?)${WS}#([\\w.-]{1,128})${WS}\\1${WS}\\)`, "gi");

/** A value that could reach outside the drawing or run something: a link to another document (any
 *  `url()` that is not one to a part of the drawing itself, however it is quoted), a picture by any
 *  other function that loads one, a script, an expression, an escape or a control character that
 *  could hide one of these. Entities were decoded when the markup was read, so `&quot;` is a quote
 *  here. */
export function unsafe(value: string): boolean {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what this refuses
  if (/[\\<>\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(value)) return true;
  /* what is left with every reference to the drawing itself taken out, and every comment, may not name an address */
  const rest = value
    .replace(LOCAL_URL, " ")
    .replace(/\/\*[\s\S]*?(\*\/|$)/g, "")
    .toLowerCase();
  return /url\s*\(|image-set\s*\(|image\s*\(|src\s*\(|cross-fade\s*\(|element\s*\(|attr\s*\(|expression\s*\(|@import|javascript:|vbscript:|data:|behavior\s*:|-moz-binding/.test(rest);
}

/** the names of the parts of the drawing a value points at */
const pointsAt = (value: string): string[] => [...value.matchAll(LOCAL_URL)].map((m) => m[2]);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });

type Tag = { name: string; attrs: [string, string][]; kids: Tag[] };

/** the longest markup read, and the most elements kept: a drawing, not a document */
export const MAX_MARKUP = 200_000;
const MAX_ELEMENTS = 4000;
/** how deep a drawing nests: what is deeper is dropped, so nothing that walks the tree runs out of stack */
export const MAX_DEPTH = 64;
/** how much more than its own elements a drawing may draw by reusing its parts (`use`, masks, clips,
 *  patterns): past this, the reference that would go over is dropped */
export const MAX_REUSE = 2000;
/** how many references deep reuse may go (a `use` of a group holding a masked shape…) */
const MAX_CHAIN = 8;

/** The elements of a piece of markup, as a tree; text, comments, declarations and anything that
 *  is not a well-formed tag are skipped, and what lies deeper than `MAX_DEPTH` is read but kept
 *  nowhere. Never throws, and takes time in proportion to the markup. */
function parse(markup: string): Tag[] {
  const src = markup.slice(0, MAX_MARKUP);
  const root: Tag = { name: "#root", attrs: [], kids: [] };
  const stack: Tag[] = [root];
  /** how many of each name are open, so that a closing tag nothing opened costs nothing */
  const open = new Map<string, number>();
  let count = 0;
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) break;
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src[lt + 1] === "?" || src[lt + 1] === "!") {
      const end = src.indexOf(">", lt);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (src[lt + 1] === "/") {
      const end = src.indexOf(">", lt);
      const name = src.slice(lt + 2, end < 0 ? src.length : end).trim();
      /* a closing tag closes the nearest open one of its name, and whatever it left open inside */
      if (open.get(name))
        for (let s = stack.length - 1; s > 0; s--)
          if (stack[s].name === name) {
            for (const t of stack.slice(s)) open.set(t.name, (open.get(t.name) ?? 1) - 1);
            stack.length = s;
            break;
          }
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    const m = /^<([A-Za-z][\w:.-]*)/.exec(src.slice(lt, lt + 200));
    if (!m) {
      i = lt + 1;
      continue;
    }
    let j = lt + m[0].length;
    const attrs: [string, string][] = [];
    let closed = false;
    for (;;) {
      while (j < src.length && /\s/.test(src[j])) j++;
      if (j >= src.length) break;
      if (src[j] === ">") {
        j++;
        break;
      }
      if (src[j] === "/" && src[j + 1] === ">") {
        closed = true;
        j += 2;
        break;
      }
      const a = /^([^\s=/>"']+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/.exec(src.slice(j, j + 100_000));
      if (!a) {
        j++;
        continue;
      }
      attrs.push([a[1], decode(a[2] ?? a[3] ?? a[4] ?? "")]);
      j += a[0].length;
    }
    i = j;
    if (++count > MAX_ELEMENTS) break;
    const tag: Tag = { name: m[1], attrs, kids: [] };
    /* past the deepest a drawing goes, an element is still read, so that what closes it is found, but
     * it hangs from nothing: it and all it holds are dropped */
    if (stack.length <= MAX_DEPTH) stack[stack.length - 1].kids.push(tag);
    if (!closed) {
      stack.push(tag);
      open.set(tag.name, (open.get(tag.name) ?? 0) + 1);
    }
  }
  return root.kids;
}

/** a `style` attribute with only the painting properties left, or undefined when none are */
function cleanStyle(style: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const at = decl.indexOf(":");
    if (at < 0) continue;
    const name = decl.slice(0, at).trim().toLowerCase();
    const value = decl.slice(at + 1).trim();
    const key = STYLE[name];
    if (!key || !value || unsafe(value) || /!important/i.test(value)) continue;
    if (/url\s*\(/i.test(value) && !PAINTS.has(key)) continue;
    out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** the attributes of an element that are kept, under React's names. A reference is kept as written
 *  here; whether what it points at is there, and its own name, are settled with the whole drawing. */
function cleanAttrs(tag: Tag): Record<string, PValue> {
  const props: Record<string, PValue> = {};
  for (const [raw, value] of tag.attrs) {
    const name = raw.trim();
    /* an event handler, under any spelling */
    if (/^on/i.test(name)) continue;
    if (name.toLowerCase() === "style") {
      const style = cleanStyle(value);
      if (style) props.style = style;
      continue;
    }
    const key = ATTRS[name];
    if (!key) continue;
    if (key === "href") {
      /* only a part of this same drawing, and only from `use` */
      if (tag.name === "use" && /^#[\w.-]{1,128}$/.test(value.trim())) props.href = value.trim();
      continue;
    }
    if (key === "id") {
      if (ID.test(value.trim())) props.id = value.trim();
      continue;
    }
    if (unsafe(value)) continue;
    if (/url\s*\(/i.test(value) && !POINTERS.has(key)) continue;
    props[key] = value;
  }
  return props;
}

/** an element on its way to being drawn: kept, cleaned, its references not yet settled */
type El = { name: string; props: Record<string, PValue>; kids: El[] };

function toEl(tag: Tag): El | null {
  if (!ELEMENTS.has(tag.name)) return null;
  const kids = tag.kids.flatMap((k) => (SILENT.has(k.name) ? [] : [toEl(k)])).filter((k): k is El => k !== null);
  return { name: tag.name, props: cleanAttrs(tag), kids };
}

/** a short name made of a string, the same every time: what keeps one drawing's names apart from another's */
function scopeName(s: string): string {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761);
    b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return `s${(b >>> 0).toString(36)}${(a >>> 0).toString(36)}`;
}

/** The references of a drawing settled, in place: each part's name is made the drawing's own, each
 *  reference to a part that is there points at it under that name, and every other reference goes.
 *  A reference also goes when it would close a loop, go too many references deep, or make the
 *  drawing draw more than `MAX_REUSE` elements more than it holds: what a `use`, a mask or a clip
 *  draws counts once per place it is used, and a pattern once per element that paints with it. */
function settle(root: El, prefix: string) {
  const named = new Map<string, El>();
  const visit = (el: El) => {
    const id = el.props.id;
    if (typeof id === "string") {
      /* the first of a name is the one a reference finds; a second of the same name is no one's */
      if (named.has(id)) delete el.props.id;
      else {
        named.set(id, el);
        el.props.id = prefix + id;
      }
    }
    el.kids.forEach(visit);
  };
  visit(root);

  const weights = new Map<El, number>();
  const busy = new Set<El>();
  let chain = 0;
  let spent = 0;
  /** what drawing a part once costs, or null when it may not be pointed at from here */
  const follow = (id: string): number | null => {
    const target = named.get(id);
    if (!target) return null;
    if (GRADIENTS.has(target.name)) return 0;
    if (busy.has(target) || chain >= MAX_CHAIN) return null;
    chain++;
    const w = weigh(target);
    chain--;
    return w;
  };
  /** what a value's references cost, or null when one of them may not be followed */
  const cost = (value: PValue): number | null => {
    if (typeof value !== "string") return 0;
    let sum = 0;
    for (const id of pointsAt(value)) {
      const w = follow(id);
      if (w === null) return null;
      sum += w;
    }
    return sum;
  };
  /** keeps a reference when what it adds still fits, under the drawing's own name for what it points at */
  const settleValue = (value: PValue, extra: number | null): PValue | undefined => {
    if (typeof value !== "string" || !/url\s*\(/i.test(value)) return value;
    if (extra === null || spent + extra > MAX_REUSE) return undefined;
    spent += extra;
    return value.replace(LOCAL_URL, (_all, _q, id: string) => `url(#${prefix}${id})`);
  };

  /** The elements an element draws, its own and what it reuses; its references are settled on the way. */
  function weigh(el: El): number {
    const known = weights.get(el);
    if (known !== undefined) return known;
    busy.add(el);
    let base = 1;
    for (const k of el.kids) base += weigh(k);
    const props = el.props;
    const style = props.style as Record<string, PValue> | undefined;
    /* what is drawn in its place: a `use`'s copy, a mask, a clip */
    if (typeof props.href === "string") {
      const w = follow(props.href.slice(1));
      if (w === null || spent + w > MAX_REUSE) delete props.href;
      else {
        spent += w;
        base += w;
        props.href = `#${prefix}${props.href.slice(1)}`;
      }
    }
    for (const key of ["mask", "clipPath"]) {
      if (!(key in props)) continue;
      const before = spent;
      const next = settleValue(props[key], cost(props[key]));
      if (next === undefined) delete props[key];
      else props[key] = next;
      base += spent - before;
    }
    /* what paints it, and everything inside it that does not say otherwise */
    let total = base;
    const paint = (bag: Record<string, PValue>, key: string) => {
      if (!(key in bag)) return;
      const per = cost(bag[key]);
      const before = spent;
      const next = settleValue(bag[key], per === null ? null : per * base);
      if (next === undefined) delete bag[key];
      else bag[key] = next;
      total += spent - before;
    };
    for (const key of PAINTS) {
      paint(props, key);
      if (style) paint(style, key);
    }
    if (style && !Object.keys(style).length) delete props.style;
    busy.delete(el);
    weights.set(el, total);
    return total;
  }
  weigh(root);
}

function toNode(el: El): PNode | null {
  /* a `use` whose reference went has nothing to draw */
  if (el.name === "use" && !el.props.href) return null;
  const kids = el.kids.map(toNode).filter((k): k is PNode => k !== null);
  return h(el.name, Object.keys(el.props).length ? el.props : null, ...kids);
}

/** the size a drawing says it is, from its viewBox or its width and height */
function viewBoxOf(props: Record<string, PValue>): string | undefined {
  const vb = typeof props.viewBox === "string" ? props.viewBox.trim() : "";
  if (/^-?[\d.]+([\s,]+-?[\d.]+){3}$/.test(vb)) return vb.replace(/,/g, " ").replace(/\s+/g, " ");
  const w = parseFloat(String(props.width ?? ""));
  const hh = parseFloat(String(props.height ?? ""));
  return w > 0 && hh > 0 ? `0 0 ${w} ${hh}` : undefined;
}

export type CleanSvg = { viewBox: string; attrs: Record<string, PValue>; children: PNode[] };

/** Pasted markup as what the vector atom draws: the outer `svg`'s viewBox and the paint it sets for
 *  everything in it, and the elements inside, all cleaned. Bare shapes with no `svg` around them
 *  work too. Null when nothing that draws is left, and never throws.
 *
 *  `scope` names the drawing among others on the same page (the part's id): the names its parts are
 *  given come from it, so the canvas, the preview and printed code all give the same drawing the
 *  same names, and two drawings never share one. Without it the markup names itself. */
export function sanitizeSvg(markup: string, scope?: string): CleanSvg | null {
  try {
    if (typeof markup !== "string" || !markup.trim()) return null;
    const top = parse(markup);
    const outer = top.find((t) => t.name === "svg");
    const kids = (outer ? outer.kids : top).flatMap((t) => (SILENT.has(t.name) ? [] : [toEl(t)])).filter((n): n is El => n !== null);
    if (!kids.length) return null;
    const own = outer ? cleanAttrs(outer) : {};
    /* the outer element is the part's own: it has no name to be pointed at by */
    delete own.id;
    const root: El = { name: "svg", props: own, kids };
    settle(root, `${scopeName(scope || markup)}-`);
    const nodes = root.kids.map(toNode).filter((n): n is PNode => n !== null);
    if (!nodes.length) return null;
    const viewBox = viewBoxOf(own) ?? "0 0 24 24";
    /* the outer element's size is the part's; what it paints with passes down */
    const { viewBox: _vb, width: _w, height: _h, preserveAspectRatio: _par, ...attrs } = root.props;
    return { viewBox, attrs, children: nodes };
  } catch {
    return null;
  }
}

/* ---------- writing a cleaned drawing out again ---------- */

/** attribute names React and SVG spell the same; every other React name is SVG's with dashes */
const CAMEL = new Set(["viewBox", "preserveAspectRatio", "gradientUnits", "gradientTransform", "spreadMethod", "patternUnits", "patternContentUnits", "patternTransform", "clipPathUnits", "maskUnits", "maskContentUnits", "pathLength"]);
const svgName = (k: string) => (CAMEL.has(k) ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Markup for what the sanitizer kept. Its parts are renamed p0, p1… in the order they appear, so the
 *  markup is short and the same for the same drawing; the vector atom scopes the names again when it
 *  draws them. */
export function cleanToMarkup(clean: CleanSvg): string {
  const names = new Map<string, string>();
  const collect = (n: PNode) => {
    const id = n.props?.id;
    if (typeof id === "string" && !names.has(id)) names.set(id, `p${names.size}`);
    for (const c of n.children ?? []) if (typeof c !== "string") collect(c);
  };
  clean.children.forEach(collect);
  const rename = (v: string) => v.replace(/url\(#([\w.-]+)\)/g, (all, id: string) => (names.has(id) ? `url(#${names.get(id)})` : all));
  const value = (k: string, v: PValue): string | undefined => {
    if (v === null || v === undefined || v === false) return undefined;
    if (k === "style" && typeof v === "object") {
      const decls = Object.entries(v as Record<string, PValue>)
        .filter(([, x]) => x !== null && x !== undefined)
        .map(([p, x]) => `${svgName(p)}:${rename(String(x))}`);
      return decls.length ? decls.join(";") : undefined;
    }
    if (typeof v === "object") return undefined;
    const s = String(v);
    if (k === "id") return names.get(s) ?? s;
    if (k === "href") return s.startsWith("#") && names.has(s.slice(1)) ? `#${names.get(s.slice(1))}` : s;
    return rename(s);
  };
  const attrs = (props: Record<string, PValue> | undefined) =>
    Object.entries(props ?? {})
      .map(([k, v]) => [k, value(k, v)] as const)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => ` ${svgName(k)}="${esc(v!)}"`)
      .join("");
  const write = (n: PNode | string): string => {
    if (typeof n === "string") return esc(n);
    const kids = (n.children ?? []).map(write).join("");
    return kids ? `<${n.type}${attrs(n.props)}>${kids}</${n.type}>` : `<${n.type}${attrs(n.props)}/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${esc(clean.viewBox)}"${attrs(clean.attrs)}>${clean.children.map(write).join("")}</svg>`;
}

/** a path's `d`, if it is only path commands and numbers */
export const cleanPath = (d: string): string | undefined => (typeof d === "string" && /^[\sMmLlHhVvCcSsQqTtAaZz\d.,eE+-]+$/.test(d) && /\d/.test(d) ? d.trim() : undefined);

/* ---------- the library ---------- */

/** a shape of the library: what it is called, its box, and its outline (filled unless `stroke`) */
export type SvgPreset = { label: string; zh: string; ja: string; ko: string; viewBox: string; d: string[]; stroke?: number };

/** points round a centre, alternating between two radii: a star or a burst */
function star(points: number, outer: number, inner: number, c = 50): string {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points - Math.PI / 2;
    const r = i % 2 ? inner : outer;
    out.push(`${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${out.join(" L")} Z`;
}

export const SVG_PRESETS: Record<string, SvgPreset> = {
  ribbon: { label: "Ribbon banner", zh: "丝带横幅", ja: "リボン", ko: "리본 배너", viewBox: "0 0 160 48", d: ["M0 10H20V4H140V10H160L150 26L160 42H140V48H20V42H0L10 26Z", "M20 42V10L28 4V36Z", "M140 42V10L132 4V36Z"] },
  starburst: { label: "Starburst", zh: "爆炸星", ja: "スターバースト", ko: "스타버스트", viewBox: "0 0 100 100", d: [star(16, 49, 38)] },
  star: { label: "Star", zh: "星形", ja: "星", ko: "별", viewBox: "0 0 100 100", d: [star(5, 48, 20)] },
  sparkle: { label: "Sparkle", zh: "闪光", ja: "きらめき", ko: "반짝임", viewBox: "0 0 24 24", d: ["M12 1C12.9 7.6 16.4 11.1 23 12C16.4 12.9 12.9 16.4 12 23C11.1 16.4 7.6 12.9 1 12C7.6 11.1 11.1 7.6 12 1Z"] },
  wave: { label: "Wave", zh: "波浪", ja: "波", ko: "물결", viewBox: "0 0 160 40", d: ["M0 18C20 4 40 4 60 18S100 32 120 18S150 6 160 12V40H0Z"] },
  hexagon: { label: "Hexagon", zh: "六边形", ja: "六角形", ko: "육각형", viewBox: "0 0 100 100", d: ["M50 2L92 26V74L50 98L8 74V26Z"] },
  diamond: { label: "Diamond", zh: "菱形", ja: "ひし形", ko: "마름모", viewBox: "0 0 100 100", d: ["M50 2L98 50L50 98L2 50Z"] },
  shield: { label: "Shield", zh: "盾牌", ja: "盾", ko: "방패", viewBox: "0 0 100 120", d: ["M50 2L94 18V58C94 88 74 106 50 118C26 106 6 88 6 58V18Z"] },
  squircle: { label: "Squircle", zh: "超椭圆", ja: "スクワークル", ko: "스쿼클", viewBox: "0 0 100 100", d: ["M50 0C88 0 100 12 100 50S88 100 50 100S0 88 0 50S12 0 50 0Z"] },
  blob: { label: "Blob", zh: "水滴团", ja: "ブロブ", ko: "블롭", viewBox: "0 0 100 100", d: ["M71 9C86 17 97 33 95 51C93 70 80 88 61 94C42 100 20 92 10 76C0 60 3 38 15 24C27 10 56 1 71 9Z"] },
  "speech-tail": { label: "Speech tail", zh: "气泡尾巴", ja: "吹き出しの尾", ko: "말풍선 꼬리", viewBox: "0 0 24 16", d: ["M0 0H24C18 2 12 8 6 16C7 9 5 3 0 0Z"] },
  tag: { label: "Price tag", zh: "价签", ja: "値札", ko: "가격표", viewBox: "0 0 120 48", d: ["M0 8C0 3.6 3.6 0 8 0H96L120 24L96 48H8C3.6 48 0 44.4 0 40Z"] },
  chevron: { label: "Chevron band", zh: "箭头色带", ja: "矢羽根", ko: "화살 띠", viewBox: "0 0 120 40", d: ["M0 0H104L120 20L104 40H0L16 20Z"] },
  corner: { label: "Corner ornament", zh: "角花", ja: "コーナー飾り", ko: "모서리 장식", viewBox: "0 0 48 48", d: ["M3 45V16C3 8.8 8.8 3 16 3H45", "M10 45V20C10 14.5 14.5 10 20 10H45", "M3 3L10 10"], stroke: 2.5 },
  arc: { label: "Arc divider", zh: "弧形分隔", ja: "アーチ区切り", ko: "아치 구분선", viewBox: "0 0 160 24", d: ["M0 24C40 0 120 0 160 24Z"] },
  ring: { label: "Ring", zh: "圆环", ja: "リング", ko: "고리", viewBox: "0 0 100 100", d: ["M50 4A46 46 0 1 1 50 96A46 46 0 1 1 50 4"], stroke: 8 },
};

export const SVG_PRESET_KEYS = Object.keys(SVG_PRESETS);
