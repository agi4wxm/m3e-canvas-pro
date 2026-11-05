/* Turns a sketch into code: one React component per screen, built from the real
 * shadcn M3E components (https://shadcn-m3e.crystaworld.dev), not a picture of them.
 *
 * Every part prints its own tree. The layout is the sketch's own: every run of parts is
 * placed absolutely inside a box the size of its screen, except what a container's auto layout
 * holds, which is nested in that container in real flex and grid. */
import {
  Doc,
  Frame,
  Group,
  Item,
  PHONE_H,
  PHONE_W,
  explodeGroup,
  frameOfPart,
  frameSizeOf,
  frameLengthOf,
  canCollapseFab,
  groupBounds,
  ownerIdOf,
  unionRect,
  layoutOf,
  normalizeTheme,
  paletteOf,
  sizeOf,
  GAP,
  STATUS_BAR_H,
  type ColorToken,
} from "./tokens";
import { hasBackdrop } from "./styles";
import { EXTERNAL } from "../parts/externals";
import { FILE_OF } from "../parts/files.generated";
import { WIDGET_SOURCES } from "../parts/widgets/sources";
import { inlineNode, itemOfFile, namesIn } from "../parts/print";
import { flowClasses } from "../parts/flow";
import { mapNodes, type PNode, type PValue } from "../parts/node";
import { expandDoc } from "./expand";
import { childLayoutOf, flowOf, outOfPane, sizingOf, type Flow } from "./flow";
import { Behaviour, type RuntimeSpec, type Uses } from "./printBehaviour";
import { partBySlug } from "../parts/registry";
import { fullWidth, roleOf } from "../parts/role";
import { pinOf } from "./tidy";

const REGISTRY_URL = "https://shadcn-m3e.crystaworld.dev/r/{name}.json";

type CodeResult = {
  /** the TSX source: the imports, then one component per screen */
  code: string;
  /** the command that adds every component the code uses */
  install: string;
};

export type Imports = Map<string, Set<string>>;

/** a color token as the Tailwind role utility the shadcn M3E styles define */
const role = (t: ColorToken | string) => t.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const str = (s: string) => JSON.stringify(s);

/** the path the code gives a picture the sketch holds as data: the file's own contents stay in the sketch */
const PLACEHOLDER_IMAGE = "/placeholder.svg";
const RUNTIME = "@/runtime";

/* A condition printed around JSX is one line of its own with the JSX indented under it, which `pretty`
 * can only do if it can tell these apart from a brace in the text of a part. */
const GATE_OPEN = "";
const GATE_END = "";
const GATE_CLOSE = "";
/* a part settled as never showing (on a row it is not for, say) is not printed at all */
const gated = (gates: string[], source: string) => (gates.includes("false") ? "" : gates.length ? `${GATE_OPEN}{${gates.join(" && ")} && (${GATE_END}${source}${GATE_CLOSE}` : source);

class Ctx {
  imports: Imports = new Map();
  /** `<Toaster />` has to be rendered once for a toast to show */
  usesToast = false;
  /** what this screen takes from the runtime */
  uses: Uses = { app: new Set(), press: false };
  constructor(
    readonly b: Behaviour,
    readonly frame: Frame,
    readonly widths: Record<string, number>,
  ) {}
  /** the modules the code imports from, with the names it takes from each */
  use(...names: string[]) {
    for (const n of names) {
      if (n === "toast") this.usesToast = true;
      const file = FILE_OF[n];
      const source = WIDGET_SOURCES[n] ?? EXTERNAL[n] ?? (file ? `@/components/m3e/${file}` : undefined);
      if (!source) continue;
      const set = this.imports.get(source) ?? new Set<string>();
      set.add(n);
      this.imports.set(source, set);
    }
  }
}

/** the JSX of one part */
function jsx(it: Item, c: Ctx, insideTap = false): string {
  if (!partBySlug(it.component)) return `{/* unknown component ${it.component ?? ""} */}`;
  const { tree, keepTap, wrap } = c.b.printPart(it, c.uses, insideTap);
  c.use(...namesIn(tree));
  return wrap(inlineNode(tree, keepTap));
}

/** a part that takes the room its layout gives it, not a number of pixels */
function fluid(tree: PNode, keys: ("width" | "height")[]): PNode {
  const style = { ...((tree.props?.style as Record<string, PValue> | undefined) ?? {}) };
  for (const k of keys) if (k in style) style[k] = "100%";
  return { ...tree, props: { ...tree.props, style } };
}

/** What a part in a layout asks of it, in classes on a box around it: to take the room left (`flex-1`), to stand
 *  elsewhere across the run (`self-*`), to stay where it was put (`absolute`), its least and most measure, the columns
 *  of a grid it takes. `fill` names the axes it fills, which its own tree then takes as 100%. `origin` is the corner
 *  of the box the layout is drawn in, which an absolute part is placed from. */
function itemClasses(run: Group, parent: Flow, origin: { x: number; y: number }): { classes: string; fill: ("width" | "height")[] } {
  const it = run.items.length === 1 ? run.items[0] : undefined;
  const c = childLayoutOf(it);
  if (c.absolute) return { classes: `absolute left-[${Math.round(run.x - origin.x)}px] top-[${Math.round(run.y - origin.y)}px]`, fill: [] };
  const w = sizingOf(it, parent, "w");
  const h = sizingOf(it, parent, "h");
  const out: string[] = [];
  const fill: ("width" | "height")[] = [...(w === "fill" ? (["width"] as const) : []), ...(h === "fill" ? (["height"] as const) : [])];
  const selfAlign = c.self && c.self !== "stretch" ? c.self : undefined;
  if (parent.dir === "grid") {
    if (c.span > 1) out.push(`col-span-${Math.min(c.span, parent.columns)}`);
    /* a grid lines its cells up both ways: a part that fills stretches both ways, one that stands elsewhere does too */
    if (w === "fill" && parent.align !== "stretch") out.push("justify-self-stretch");
    if (h === "fill") out.push("self-stretch");
    if (selfAlign) out.push(selfAlign === "baseline" ? "self-baseline justify-self-start" : `${h === "fill" ? "" : `self-${selfAlign} `}${w === "fill" ? "" : `justify-self-${selfAlign}`}`.trim());
  } else {
    const main = parent.dir === "row" ? w : h;
    const cross = parent.dir === "row" ? h : w;
    if (main === "fill") out.push(parent.dir === "column" ? "min-h-0 flex-1" : "min-w-0 flex-1");
    const across = c.self ?? parent.align;
    if (cross === "fill" && across !== "stretch") out.push("self-stretch");
    else if (cross !== "fill" && across === "stretch") out.push("self-start");
    else if (selfAlign) out.push(`self-${selfAlign}`);
  }
  for (const [axis, key] of [["w", "w"], ["h", "h"]] as const) {
    if (c.min[axis] !== undefined) out.push(`min-${key}-[${Math.round(c.min[axis]!)}px]`);
    if (c.max[axis] !== undefined) out.push(`max-${key}-[${Math.round(c.max[axis]!)}px]`);
  }
  return { classes: out.filter(Boolean).join(" "), fill };
}

/** The JSX of a run laid out by a container: nested, the way the browser will lay it out. The classes
 *  of the layout go on the node the container keeps for it, or on its root. */
function flowJsx(run: Group, c: Ctx, all: Group[], parent?: Flow, inside = new Set<string>(), insideTap = false, origin = { x: 0, y: 0 }): string {
  if (parent && run.expandedFrom !== undefined) return instanceJsx(run, c, all, inside);
  const it = run.items[0];
  const def = partBySlug(it.component);
  const flow = run.items.length === 1 ? flowOf(run) : null;
  if (!def || (!flow && !parent)) return run.items.map((x) => jsx(x, c, insideTap)).join("");
  const asked = parent ? itemClasses(run, parent, origin) : { classes: "", fill: [] as ("width" | "height")[] };
  /* the box around a part says what the layout asks of it; with nothing to say, there is no box */
  const boxed = (source: string) => (asked.classes ? `<div className=${str(asked.classes)}>${source}</div>` : source);
  if (!flow) {
    if (run.items.length !== 1) return boxed(`<div className="flex ${run.axis === "x" ? "flex-row" : "flex-col"} gap-[${GAP}px]">${run.items.map((x) => jsx(x, c, insideTap)).join("")}</div>`);
    const part = c.b.printPart(it, c.uses, insideTap);
    const tree = fluid(part.tree, asked.fill);
    c.use(...namesIn(tree));
    return boxed(part.wrap(inlineNode(tree, part.keepTap)));
  }
  const kids = all.filter((g) => g.inFlow === run.id && !g.locked);
  const part = c.b.printPart(it, c.uses, insideTap);
  const tapped = insideTap || !!it.action || !!Object.keys(it.actions ?? {}).length;
  const within = new Set(inside).add(run.id);
  /* a layout in a layout takes the room the outer one gives it too */
  let tree = fluid(part.tree, asked.fill);
  const fit = [...(sizedByContents(run, flow, parent, "w") ? ["width"] : []), ...(sizedByContents(run, flow, parent, "h") ? ["height"] : [])];
  const style = Object.fromEntries(Object.entries((tree.props?.style as Record<string, PValue> | undefined) ?? {}).filter(([k]) => !fit.includes(k)));
  tree = { ...tree, props: { ...tree.props, style } };
  const marked = (n: PNode): boolean => !!n.props?.["data-flow"] || !!n.children?.some((x) => typeof x !== "string" && marked(x));
  const host = marked(tree) ? (n: PNode) => !!n.props?.["data-flow"] : (n: PNode) => n === tree;
  /* what stands loose in it is placed from the box the layout is drawn in */
  const loose = kids.some((k) => childLayoutOf(k.items.length === 1 ? k.items[0] : undefined).absolute);
  const HOLE = "@@flow@@";
  const placed = mapNodes(tree, (n) => {
    const clean = n.props?.["data-flow"] ? Object.fromEntries(Object.entries(n.props).filter(([k]) => k !== "data-flow")) : n.props;
    if (!host(n)) return { ...n, props: clean };
    const className = [typeof clean?.className === "string" ? clean.className : "", flowClasses(flow), loose ? "relative" : ""].filter(Boolean).join(" ");
    return { ...n, props: { ...clean, className }, children: [HOLE] };
  });
  c.use(...namesIn(placed));
  const box = { x: run.x + (marked(tree) ? flow.inset.l : 0), y: run.y + (marked(tree) ? flow.inset.t : 0) };
  const held = kids.map((k) => gated(c.b.gates(k, within, c.uses), flowJsx(k, c, all, flow, within, tapped, box))).join("");
  /* a function: a `$` in a part's words is not a replacement pattern */
  return boxed(part.wrap(inlineNode(placed, part.keepTap).replace(HOLE, () => held)));
}

/** a layout that takes the size of its contents on an axis, all said: its own prop, unless the layout around it fills
 *  that axis or the part says otherwise */
function sizedByContents(run: Group, flow: Flow, parent: Flow | undefined, axis: "w" | "h"): boolean {
  const own = axis === "w" ? flow.hugW : flow.hugH;
  if (!parent) return own;
  const it = run.items[0];
  const s = sizingOf(it, parent, axis);
  if (s === "fill" && !(axis === "w" ? parent.hugW : parent.hugH)) return false;
  const set = childLayoutOf(it).size[axis];
  return set === "hug" ? true : set === "fixed" ? false : own;
}

/** What an instance standing in a layout comes to: a box of its size in the layout's flow, its parts
 *  placed inside the box. They move with it when the flow does, as when something before it goes. */
function instanceJsx(run: Group, c: Ctx, all: Group[], inside: Set<string>): string {
  const within = new Set(inside).add(run.id);
  const kids = all.filter((g) => g.id.startsWith(`${run.id}/`)).sort((a, b) => a.y - b.y || a.x - b.x);
  const { width, height } = (run.items[0].props ?? {}) as { width?: number; height?: number };
  const body = screenBody({ ...c.frame, x: run.x, y: run.y }, kids, c, c.widths, all, false, false, run.id, within);
  return `<div className="relative shrink-0" style={{ width: ${Math.round(width ?? 0)}, height: ${Math.round(height ?? 0)} }}>${body.join("")}</div>`;
}

/** the instance a run's parts are printed inside: the nearest around it that a layout places */
function flowedInstanceOf(id: string, all: Map<string, Group>, hosts: Set<string>): string | undefined {
  for (let at = ownerIdOf(id); at; at = ownerIdOf(at)) {
    const g = all.get(at);
    if (g?.expandedFrom !== undefined && g.inFlow && hosts.has(g.inFlow)) return at;
  }
  return undefined;
}

/** the pieces of a screen, each run placed where the sketch has it */
function screenBody(frame: Frame, runs: Group[], c: Ctx, widths: Record<string, number>, all: Group[], pinEdges = true, foldOnScroll = false, scope?: string, inside: Set<string> = new Set()): string[] {
  const { h } = frameSizeOf(frame);
  const out: string[] = [];
  const hosts = new Set(all.filter((r) => flowOf(r)).map((r) => r.id));
  const byId = new Map(all.map((g) => [g.id, g]));
  for (const run of runs) {
    /* what a layout holds is printed inside it */
    if (run.inFlow && hosts.has(run.inFlow) && !run.locked) continue;
    if (flowedInstanceOf(run.id, byId, hosts) !== scope) continue;
    const gates = c.b.gates(run, inside, c.uses);
    const float = c.b.floats(run) ? " z-10" : "";
    if (hosts.has(run.id)) {
      out.push(gated(gates, `<div className=${str(`absolute left-[${Math.round(run.x - frame.x)}px] top-[${Math.round(run.y - frame.y)}px]`)}>${flowJsx(run, c, all)}</div>`));
      continue;
    }
    const first = run.items[0];
    const at = layoutOf(run, widths)[0];
    const top = Math.round(at.y - frame.y);
    const left = Math.round(at.x - frame.x);
    const body = run.items.map((it) => {
      const source = jsx(it, c);
      if (!foldOnScroll || !it.collapseOnScroll || !canCollapseFab(it)) return source;
      const fab = source.replace(/ collapsed(?:=\{[^}]*\}|="[^"]*")?/g, "").replace("<ExtendedFab", `<ExtendedFab collapsed={fabFolded${it.props?.collapsed === true ? " || true" : ""}}`);
      return `<div className="flex justify-end" style={{ width: ${Math.round(sizeOf(it, widths).w)} }}>${fab}</div>`;
    });
    /* a part that spans the screen keeps to its edges; the bars stay pinned to the top or the bottom */
    if (run.items.length === 1 && fullWidth(first)) {
      const r = roleOf(first);
      const bottom = pinEdges && r === "bottom" && top + sizeOf(first, widths).h > h - 1;
      const pinnedTop = pinEdges && r === "top" && top <= STATUS_BAR_H;
      const anchor = bottom ? "bottom-0" : pinnedTop ? "top-0" : `top-[${top}px]`;
      out.push(gated(gates, `<div className="absolute inset-x-0 ${anchor}${float}">${body[0]}</div>`));
      continue;
    }
    const pos = `absolute left-[${left}px] top-[${top}px]${float}`;
    if (body.length === 1) out.push(gated(gates, `<div className=${str(pos)}>${body[0]}</div>`));
    else out.push(gated(gates, `<div className=${str(`${pos} flex ${run.axis === "x" ? "flex-row" : "flex-col"} gap-[${GAP}px]`)}>${body.join("")}</div>`));
  }
  return out;
}

/** a component name for a screen: its own name when that is made of letters, else `ScreenN` */
function componentName(name: string, index: number, taken: Set<string>): string {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  let n = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  if (!n || /^\d/.test(n)) n = `Screen${index + 1}`;
  else if (!n.endsWith("Screen")) n += "Screen";
  let out = n;
  for (let i = 2; taken.has(out); i++) out = `${n}${i}`;
  taken.add(out);
  return out;
}

/** The tags and the text between them. A tag ends at the first `>` outside quotes and braces
 *  (an arrow function's `=>` sits inside braces); text ends at the next `<` outside braces. */
function tokenize(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === GATE_OPEN) {
      const end = s.indexOf(GATE_END, i);
      out.push(s.slice(i, end));
      i = end + 1;
      continue;
    }
    if (s[i] === GATE_CLOSE) {
      out.push(GATE_CLOSE);
      i++;
      continue;
    }
    const tag = s[i] === "<";
    let j = tag ? i + 1 : i;
    let depth = 0;
    let quote = "";
    for (; j < s.length; j++) {
      const ch = s[j];
      if (quote) {
        if (ch === "\\") j++;
        else if (ch === quote) quote = "";
      } else if ((tag || depth > 0) && (ch === '"' || ch === "'" || ch === "`")) quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (tag && ch === ">" && depth === 0) break;
      else if (!tag && (ch === "<" || ch === GATE_OPEN || ch === GATE_CLOSE) && depth === 0) {
        j--;
        break;
      }
    }
    out.push(s.slice(i, j + 1));
    i = j + 1;
  }
  return out;
}

/** how long a tag may run before its attributes go one to a line */
const LONG_TAG = 120;

/** a tag split at the spaces outside its quotes and braces */
function wrapTag(t: string, at: string): string {
  if (at.length + t.length <= LONG_TAG) return at + t;
  const pieces: string[] = [];
  let depth = 0;
  let quote = "";
  let from = 0;
  for (let j = 0; j < t.length; j++) {
    const ch = t[j];
    if (quote) {
      if (ch === "\\") j++;
      else if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === " " && depth === 0) {
      pieces.push(t.slice(from, j));
      from = j + 1;
    }
  }
  pieces.push(t.slice(from));
  if (pieces.length < 2) return at + t;
  const end = t.endsWith("/>") ? "/>" : ">";
  const last = pieces[pieces.length - 1].slice(0, -end.length).trim();
  return [at + pieces[0], ...pieces.slice(1, -1).map((p) => `${at}  ${p}`), ...(last ? [`${at}  ${last}`] : []), at + end].join("\n");
}

/** one element per line, indented by nesting; an element holding only text, or one self-closing child, stays on one line */
function pretty(source: string, depth: number): string {
  const pad = (d: number) => "  ".repeat(d);
  const tokens = tokenize(source);
  const lines: string[] = [];
  let d = depth;
  const plain = (x: string | undefined) => x !== undefined && x[0] !== GATE_OPEN && x !== GATE_CLOSE;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t[0] === GATE_OPEN) {
      lines.push(pad(d) + t.slice(1));
      d++;
    } else if (t === GATE_CLOSE) {
      d--;
      lines.push(`${pad(d)})}`);
    } else if (t.startsWith("</")) {
      d--;
      lines.push(pad(d) + t);
    } else if (t.startsWith("<")) {
      const self = t.endsWith("/>");
      const next = tokens[i + 1];
      const after = tokens[i + 2];
      const inline = !self && plain(next) && after?.startsWith("</") && (!next.startsWith("<") || next.endsWith("/>"));
      if (inline && d * 2 + t.length + next.length + after.length <= LONG_TAG) {
        lines.push(pad(d) + t + next + after);
        i += 2;
        continue;
      }
      lines.push(wrapTag(t, pad(d)));
      if (!self) d++;
    } else if (t.trim()) lines.push(pad(d) + t.trim());
  }
  return lines.join("\n");
}

/** one screen as code, with what its own file needs */
export type ScreenCode = {
  id: string;
  /** the name `go("…")` knows it by */
  key: string;
  component: string;
  width: number;
  height: number;
  /** the height of the bar at its foot: a snackbar stands above it */
  foot: number;
  source: string;
  imports: Imports;
};

type BuildOptions = {
  onlyFrameId?: string;
  /** a whole app: parts behave as they do in the preview even with no action of their own */
  live?: boolean;
  /** the path for a picture held as data */
  image?: (data: string) => string;
};

export const importLines = (imports: Imports) => [...imports.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([source, set]) => `import { ${[...set].sort((a, b) => a.localeCompare(b)).join(", ")} } from "${source}"`);

export function buildScreens(source: Doc, widths: Record<string, number>, o: BuildOptions = {}): { screens: ScreenCode[]; runtime: RuntimeSpec; usesToast: boolean } {
  /* printed code is expanded: instances and repeated rows come out as plain parts */
  const doc = expandDoc(source, widths);
  const { onlyFrameId } = o;
  /* a sketch with no screens is one open canvas: its parts' own bounds make the screen */
  let frames = doc.frame === "phone" ? doc.frames : [];
  const loose = frames.length === 0;
  if (loose && doc.groups.length) {
    const { l, t, r, b: bt } = unionRect(doc.groups.map((g) => groupBounds(g, widths)));
    frames = [{ id: "canvas", name: doc.title || "Screen", x: l, y: t, w: Math.max(PHONE_W, Math.round(r - l)), h: Math.max(PHONE_H / 2, Math.round(bt - t)) }];
  }
  const shown = onlyFrameId ? frames.filter((f) => f.id === onlyFrameId) : frames;

  const b = new Behaviour(doc, widths, { live: !!o.live, shown, image: o.image ?? PLACEHOLDER_IMAGE });
  const taken = new Set<string>();
  /* a dock whose tabs do nothing prints the content of the tab that is chosen; the rest stays in the sketch */
  const offTab = new Set([...outOfPane(doc.groups, widths)].filter((id) => !b.keepsOffTab(id)));
  let usesToast = false;
  const screens = shown.map((frame, i): ScreenCode => {
    const c = new Ctx(b, frame, widths);
    /* a layout reads its parts in the order of the document, the rest go down the screen */
    const all = doc.groups
      .filter((g) => (loose || frameOfPart(g, doc.groups, frames, widths)?.id === frame.id) && !offTab.has(g.id))
      .flatMap((g) => (g.free ? explodeGroup(g, widths) : [g]));
    const runs = [...all].sort((a, b) => a.y - b.y || a.x - b.x);
    const { w, h } = frameSizeOf(frame);
    const length = frameLengthOf(frame);
    const scrolls = length > h;
    const folds = scrolls && runs.some((run) => run.items.some((item) => item.collapseOnScroll && canCollapseFab(item)));
    const name = componentName(frame.name, i, taken);
    let body: string[];
    if (scrolls) {
      const pinned = runs.filter((run) => pinOf(run, frame, widths));
      const flowing = runs.filter((run) => !pinOf(run, frame, widths));
      const fixed = pinned.map((run) => ({ ...run, y: run.y - (pinOf(run, frame, widths) === "foot" ? length - h : 0), items: run.items.map((item) => roleOf(item) === "rail" ? { ...item, props: { ...item.props, height: h } } : item) }));
      const content = screenBody(frame, flowing, c, widths, all, false, folds);
      const overlays = screenBody(frame, fixed, c, widths, all, true, folds);
      const scrollHandler = folds ? ' onScroll={(event) => { const top = event.currentTarget.scrollTop; if (top !== lastScrollTop.current) setFabFolded(top > lastScrollTop.current); lastScrollTop.current = top }}' : "";
      body = [`<div role="region" aria-label=${str(`${frame.name || "Screen"} content`)} tabIndex={0} className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain"${scrollHandler}><div className="relative" style={{ height: ${length} }}>${content.join("")}</div></div>`, ...overlays];
    } else body = screenBody(frame, runs, c, widths, all);
    const bg = frame.bg ? `bg-${role(frame.bg)}` : "bg-surface";
    /* a style may draw something behind its screens (src/style.css) */
    const open = `<div${hasBackdrop(normalizeTheme(doc.theme)) ? " data-backdrop" : ""} className=${str(`relative overflow-hidden ${bg} w-[${w}px] h-[${h}px]`)}>`;
    const inner = [open, ...body, "</div>"].join("");
    if (folds) c.imports.set("react", new Set(["useRef", "useState"]));
    const fromApp = c.uses.app.size ? `  const { ${[...c.uses.app].sort().join(", ")} } = useApp()\n` : "";
    if (c.uses.app.size || c.uses.press) c.imports.set(RUNTIME, new Set([...(c.uses.app.size ? ["useApp"] : []), ...(c.uses.press ? ["Pressable"] : [])]));
    const state = folds ? "  const [fabFolded, setFabFolded] = useState(false)\n  const lastScrollTop = useRef(0)\n" : "";
    usesToast ||= c.usesToast;
    return {
      id: frame.id,
      key: b.screenKey(frame.id) ?? `screen${i + 1}`,
      component: name,
      width: w,
      height: h,
      foot: Math.max(0, ...runs.filter((g) => g.items.length === 1 && roleOf(g.items[0]) === "bottom").map((g) => sizeOf(g.items[0], widths).h)),
      source: `export function ${name}() {\n${fromApp}${state}  return (\n${pretty(inner, 2)}\n  )\n}`,
      imports: c.imports,
    };
  });
  return { screens, runtime: b.spec(screens.map((s) => s.key)), usesToast };
}

export function buildCode(doc: Doc, widths: Record<string, number>, onlyFrameId?: string): CodeResult {
  const palette = paletteOf(doc.paletteKey, doc.customPalette, doc.theme);
  const seed = palette.seed ?? palette.primary;
  const { screens, usesToast } = buildScreens(doc, widths, { onlyFrameId });
  const imports: Imports = new Map();
  for (const s of screens) for (const [source, set] of s.imports) imports.set(source, new Set([...(imports.get(source) ?? []), ...set]));
  const lines = importLines(imports);
  const names = [...imports.entries()].sort(([a], [b]) => a.localeCompare(b));

  const registry = "@/components/m3e/";
  const packages = names.map(([source]) => source).filter((source) => !source.startsWith("@/") && source !== "react");
  const install = `npx shadcn@latest add @m3e/base ${[...new Set(names.filter(([source]) => source.startsWith(registry)).map(([source]) => itemOfFile(source.slice(registry.length))))].map((f) => `@m3e/${f}`).join(" ")}`;
  /* a widget ships with the canvas, not with any registry or package */
  const widgetDir = "@/components/widgets/";
  const copied = names.map(([source]) => source).filter((source) => source.startsWith(widgetDir));
  const header = [
    "// Generated by M3E Canvas. Components are shadcn M3E (https://shadcn-m3e.crystaworld.dev).",
    ...copied.map((source) => `// Copy parts/widgets/${source.slice(widgetDir.length)}.tsx from the canvas into src/components/widgets/${source.slice(widgetDir.length)}.tsx`),
    `// 1. Register the registry in components.json:  "registries": { "@m3e": ${str(REGISTRY_URL)} }`,
    `// 2. ${install}`,
    `// 3. Wrap your app once:  <M3eProvider theme={{ defaultTheme: { source: { primary: ${str(seed)} }${seed.toUpperCase() === "#6750A4" ? "" : `, variant: "tonalSpot"`}${doc.theme && doc.theme.contrast !== "standard" ? `, contrast: ${str(doc.theme.contrast)}` : ""} } }}>…</M3eProvider>`,
    ...(packages.length ? [`// 4. bun add ${packages.join(" ")}`] : []),
    ...(usesToast ? [`// ${packages.length ? 5 : 4}. Render <Toaster /> (from @/components/m3e/sonner) once, so snackbars show.`] : []),
    /* the screens' taps run on it; it is written for this document, so it comes with the project */
    ...(imports.has(RUNTIME) ? ["// useApp and Pressable are in src/runtime.tsx: Download project writes it, with everything else this code needs."] : []),
  ];
  const code = [...header, "", ...lines, ...(lines.length ? [""] : []), screens.map((s) => s.source).join("\n\n"), ""].join("\n");
  return { code, install };
}
