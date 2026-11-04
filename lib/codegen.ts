/* Turns a sketch into code: one React component per screen, built from the real
 * shadcn M3E components (https://shadcn-m3e.crystaworld.dev), not a picture of them.
 *
 * Every part prints its own tree. The layout is the sketch's own: every run of parts is
 * placed absolutely inside a box the size of its screen, so what comes out is a faithful
 * starting point rather than finished, responsive code. */
import {
  Doc,
  Frame,
  Group,
  Item,
  PHONE_H,
  PHONE_W,
  explodeGroup,
  frameOfGroup,
  frameSizeOf,
  frameLengthOf,
  canCollapseFab,
  groupBounds,
  layoutOf,
  paletteOf,
  sizeOf,
  GAP,
  STATUS_BAR_H,
  type ColorToken,
} from "./tokens";
import { EXTERNAL } from "../parts/externals";
import { FILE_OF } from "../parts/files.generated";
import { WIDGET_SOURCES } from "../parts/widgets/sources";
import { inlineNode, itemOfFile, namesIn } from "../parts/print";
import { appearanceOf } from "../parts/appearance";
import { imageKeys, partBySlug, treeOf } from "../parts/registry";
import { fullWidth, roleOf } from "../parts/role";
import { pinOf } from "./tidy";

export const REGISTRY_URL = "https://shadcn-m3e.crystaworld.dev/r/{name}.json";

export type CodeResult = {
  /** the TSX source: the imports, then one component per screen */
  code: string;
  /** the command that adds every component the code uses */
  install: string;
};

type Imports = Map<string, Set<string>>;

/** a color token as the Tailwind role utility the shadcn M3E styles define */
const role = (t: ColorToken | string) => t.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const str = (s: string) => JSON.stringify(s);

/** the path the code gives a picture the sketch holds as data: the file's own contents stay in the sketch */
const PLACEHOLDER_IMAGE = "/placeholder.svg";
class Ctx {
  imports: Imports = new Map();
  /** `<Toaster />` has to be rendered once for a toast to show */
  usesToast = false;
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
function jsx(it: Item, c: Ctx): string {
  const def = partBySlug(it.component);
  if (!def) return `{/* unknown component ${it.component ?? ""} */}`;
  /* a picked image lives in the sketch as data; the code stands in a path for it */
  const props = { ...it.props };
  for (const k of imageKeys(def)) if (typeof props[k] === "string" && (props[k] as string).startsWith("data:")) props[k] = PLACEHOLDER_IMAGE;
  const tree = treeOf(def, props, appearanceOf(it));
  c.use(...namesIn(tree));
  return inlineNode(tree);
}

/** the pieces of a screen, each run placed where the sketch has it */
function screenBody(frame: Frame, runs: Group[], c: Ctx, widths: Record<string, number>, pinEdges = true, foldOnScroll = false): string[] {
  const { h } = frameSizeOf(frame);
  const out: string[] = [];
  for (const run of runs) {
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
      out.push(`<div className="absolute inset-x-0 ${anchor}">${body[0]}</div>`);
      continue;
    }
    const pos = `absolute left-[${left}px] top-[${top}px]`;
    if (body.length === 1) out.push(`<div className=${str(pos)}>${body[0]}</div>`);
    else out.push(`<div className=${str(`${pos} flex ${run.axis === "x" ? "flex-row" : "flex-col"} gap-[${GAP}px]`)}>${body.join("")}</div>`);
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
      else if (!tag && ch === "<" && depth === 0) {
        j--;
        break;
      }
    }
    out.push(s.slice(i, j + 1));
    i = j + 1;
  }
  return out;
}

/** one element per line, indented by nesting; an element holding only text, or one self-closing child, stays on one line */
function pretty(source: string, depth: number): string {
  const pad = (d: number) => "  ".repeat(d);
  const tokens = tokenize(source);
  const lines: string[] = [];
  let d = depth;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("</")) {
      d--;
      lines.push(pad(d) + t);
    } else if (t.startsWith("<")) {
      const self = t.endsWith("/>");
      const next = tokens[i + 1];
      const after = tokens[i + 2];
      const inline = !self && next !== undefined && after?.startsWith("</") && (!next.startsWith("<") || next.endsWith("/>"));
      if (inline) {
        lines.push(pad(d) + t + next + after);
        i += 2;
        continue;
      }
      lines.push(pad(d) + t);
      if (!self) d++;
    } else if (t.trim()) lines.push(pad(d) + t.trim());
  }
  return lines.join("\n");
}

export function buildCode(doc: Doc, widths: Record<string, number>, onlyFrameId?: string): CodeResult {
  const c = new Ctx();
  const palette = paletteOf(doc.paletteKey, doc.customPalette, doc.theme);
  const seed = palette.seed ?? palette.primary;

  /* a sketch with no screens is one open canvas: its parts' own bounds make the screen */
  let frames = doc.frame === "phone" ? doc.frames : [];
  const loose = frames.length === 0;
  if (loose && doc.groups.length) {
    const b = doc.groups.map((g) => groupBounds(g, widths));
    const l = Math.min(...b.map((x) => x.l));
    const t = Math.min(...b.map((x) => x.t));
    const r = Math.max(...b.map((x) => x.r));
    const bt = Math.max(...b.map((x) => x.b));
    frames = [{ id: "canvas", name: doc.title || "Screen", x: l, y: t, w: Math.max(PHONE_W, Math.round(r - l)), h: Math.max(PHONE_H / 2, Math.round(bt - t)) }];
  }
  const shown = onlyFrameId ? frames.filter((f) => f.id === onlyFrameId) : frames;

  const taken = new Set<string>();
  const screens = shown.map((frame, i) => {
    const runs = doc.groups
      .filter((g) => loose || frameOfGroup(g, frames, widths)?.id === frame.id)
      .flatMap((g) => (g.free ? explodeGroup(g, widths) : [g]))
      .sort((a, b) => a.y - b.y || a.x - b.x);
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
      const content = screenBody(frame, flowing, c, widths, false, folds);
      const overlays = screenBody(frame, fixed, c, widths, true, folds);
      const scrollHandler = folds ? ' onScroll={(event) => { const top = event.currentTarget.scrollTop; if (top !== lastScrollTop.current) setFabFolded(top > lastScrollTop.current); lastScrollTop.current = top }}' : "";
      body = [`<div role="region" aria-label=${str(`${frame.name || "Screen"} content`)} tabIndex={0} className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain"${scrollHandler}><div className="relative" style={{ height: ${length} }}>${content.join("")}</div></div>`, ...overlays];
    } else body = screenBody(frame, runs, c, widths);
    const bg = frame.bg ? `bg-${role(frame.bg)}` : "bg-surface";
    const open = `<div className=${str(`relative overflow-hidden ${bg} w-[${w}px] h-[${h}px]`)}>`;
    const inner = [open, ...body, "</div>"].join("");
    if (folds) c.imports.set("react", new Set(["useRef", "useState"]));
    const state = folds ? "  const [fabFolded, setFabFolded] = useState(false)\n  const lastScrollTop = useRef(0)\n" : "";
    return `export function ${name}() {\n${state}  return (\n${pretty(inner, 2)}\n  )\n}`;
  });

  const lines: string[] = [];
  const names = [...c.imports.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [source, set] of names) lines.push(`import { ${[...set].sort((a, b) => a.localeCompare(b)).join(", ")} } from "${source}"`);

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
    ...(c.usesToast ? [`// ${packages.length ? 5 : 4}. Render <Toaster /> (from @/components/m3e/sonner) once, so snackbars show.`] : []),
  ];
  const code = [...header, "", ...lines, ...(lines.length ? [""] : []), screens.join("\n\n"), ""].join("\n");
  return { code, install };
}
