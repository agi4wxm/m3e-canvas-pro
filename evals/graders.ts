/* The graders: deterministic checks of what a turn left, read off the document with the core's own queries. Each
 * check is a pure function of an observation (types.ts `Observed`), so a recorded run is graded again exactly the
 * same way without the model; only the optional vision judge (judge.ts) asks a model anything.
 *
 * Geometry is read the way the canvas draws it: the final document laid out with the sizes the parts measured in
 * headless Chromium (guesses where nothing was drawn), then `nodeTree` for what holds what. */

import { diffDocs, touchedScreens, type DocDiff } from "../lib/agent/diff";
import { laidOut } from "../lib/core/ops/common";
import { nodeTree, type TreeNode } from "../lib/core/query";
import { stateOf } from "../lib/core/state";
import { getLang, setGlobalLang, type Lang } from "../lib/i18n";
import { conformItem } from "../lib/styleRules";
import { contrastProblems, isStrict, withDocStyles } from "../lib/styles";
import { frameLengthOf, frameSizeOf, type Doc, type Group, type Item } from "../lib/tokens";
import { partBySlug, reader, tierOf } from "../parts/registry";
import { roleOf } from "../parts/role";
import { sanitizeSvg } from "../parts/svg";
import { createRegistry } from "../lib/tools/registry";
import { GENERATE_TOOLS } from "../lib/tools/generate";
import type { CallRecord, Check, CheckResult, Observed, Verdict, Widths } from "./types";

/* ---------- what is worked out once per observation ---------- */

/** a part as drawn: its node in the tree, its item and group, what holds it and the screen it is on */
export type Placed = { node: TreeNode; item?: Item; group?: Group; parent?: Placed; screen?: string; depth: number };

export type Graded = {
  o: Observed;
  /** the final document laid out with the measured sizes */
  doc: Doc;
  tree: ReturnType<typeof nodeTree>;
  diff: DocDiff;
  /** screens the turn added or changed, in document order */
  touched: string[];
  /** screens the turn added */
  added: string[];
  /** every part of the final document by id, as drawn */
  placed: Map<string, Placed>;
  /** what each part shows, in the task's language */
  words: Map<string, string[]>;
  /** words shown by parts the turn added or changed that the start did not show, and the names of new screens */
  newWords: string[];
  /** ids of parts the turn added */
  addedIds: Set<string>;
};

/** text props that hold code or addresses rather than words */
const NOT_WORDS = new Set(["markup", "path", "viewBox", "url", "href", "src", "link", "code"]);

/** The words a part shows with its defaults filled in (seeded in the language that is set), as the canvas would
 *  draw them: its text props that apply, the labels of its rows, the cells of its tables. */
export function wordsOfItem(it: Item): string[] {
  const def = partBySlug(it.component);
  /* a scene's words describe its picture for the image model; none of them is drawn */
  if (!def || def.slug === "scene") return [];
  const p = reader(def, it.props);
  const out: string[] = [];
  for (const d of def.props) {
    if (NOT_WORDS.has(d.key)) continue;
    let shown = true;
    try {
      shown = d.when ? d.when(p) : true;
    } catch {
      /* a condition that cannot be read: count the prop */
    }
    if (!shown) continue;
    if (d.kind === "text") out.push(p.s(d.key));
    else if (d.kind === "list") for (const r of p.list(d.key)) out.push(r.label);
    else if (d.kind === "table") {
      const t = p.table(d.key);
      /* settings rows hold icon names and control kinds beside their words: those are not words */
      for (const row of t.rows) for (const c of row) if (!/^[a-z0-9_:\-.]+$/.test(c)) out.push(c);
    }
  }
  return out.map((s) => String(s ?? "").trim()).filter((s) => s && !s.startsWith("<"));
}

/** sets the language the defaults are seeded in for a moment */
function inLang<T>(lang: Lang, fn: () => T): T {
  const was = getLang();
  setGlobalLang(lang);
  try {
    return fn();
  } finally {
    setGlobalLang(was);
  }
}

/** the document laid out with these sizes, as the renderer lays it out before drawing */
export function laidDoc(doc: Doc, widths: Widths): Doc {
  return withDocStyles(doc.styles, () => {
    const s = stateOf(doc, { widths });
    return { ...doc, groups: laidOut(s, widths).doc.groups };
  });
}

export function grade(o: Observed): Graded {
  return inLang(o.lang, () =>
    withDocStyles(o.final.styles, () => {
      const doc = laidDoc(o.final, o.widths);
      const tree = nodeTree(doc, o.widths);
      const diff = diffDocs(o.start, o.final);
      const items = new Map<string, { item: Item; group: Group }>();
      for (const g of doc.groups) for (const it of g.items) items.set(it.id, { item: it, group: g });
      const placed = new Map<string, Placed>();
      const walk = (n: TreeNode, depth: number, screen?: string, parent?: Placed) => {
        const at = items.get(n.id);
        const p: Placed = { node: n, ...(at ? { item: at.item, group: at.group } : {}), ...(parent ? { parent } : {}), ...(screen ? { screen } : {}), depth };
        placed.set(n.id, p);
        for (const c of n.children) walk(c, depth + 1, screen, p);
      };
      for (const s of tree.screens) for (const n of s.nodes) walk(n, 0, s.id);
      for (const n of tree.loose) walk(n, 0);
      const screenOf = (id: string) => placed.get(id)?.screen;
      const touched = touchedScreens(diff, doc, screenOf);
      const added = diff.screens.added.map((s) => s.id);
      const words = new Map<string, string[]>();
      for (const [id, { item }] of items) words.set(id, wordsOfItem(item));
      const before = new Set<string>();
      for (const g of o.start.groups) for (const it of g.items) for (const w of wordsOfItem(it)) before.add(w);
      const fresh = new Set<string>();
      for (const n of [...diff.nodes.added, ...diff.nodes.changed]) for (const w of words.get(n.id) ?? []) if (!before.has(w)) fresh.add(w);
      for (const s of diff.screens.added) fresh.add(s.name);
      return { o, doc, tree, diff, touched, added, placed, words, newWords: [...fresh], addedIds: new Set(diff.nodes.added.map((n) => n.id)) };
    }),
  );
}

/* ---------- small readers ---------- */

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const ok = (pass: boolean, detail: string): CheckResult => ({ pass, detail });
const quote = (s: string, n = 24) => JSON.stringify(s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** the parts on a screen, at every depth */
export const partsOn = (g: Graded, screen: string): Placed[] => [...g.placed.values()].filter((p) => p.screen === screen);

/** every word a screen shows */
export const wordsOn = (g: Graded, screen: string): string[] => partsOn(g, screen).flatMap((p) => g.words.get(p.node.id) ?? []);

/** the screens a check looks at: those named, else those the turn touched */
const screensOf = (g: Graded, only?: string[]) => (only?.length ? only.filter((id) => g.doc.frames.some((f) => f.id === id)) : g.touched);

const roleOfPlaced = (p: Placed) => (p.item ? roleOf(p.item) : undefined);
const isBar = (p: Placed) => ["top", "bottom", "floatingBottom", "rail"].includes(roleOfPlaced(p) ?? "");
/** parts drawn over the others on purpose: a FAB, an overlay, a backdrop, anything taken out of its layout */
const floats = (p: Placed) => ["fab", "overlay", "backdrop", "floatingBottom"].includes(roleOfPlaced(p) ?? "") || p.node.slug === "scene" || p.node.placed === "loose" || !!p.item?.flowAbsolute || !!p.node.hidden || !!p.group?.hidden;

const box = (n: TreeNode) => ({ l: n.x, t: n.y, r: n.x + n.w, b: n.y + n.h });
function overlap(a: TreeNode, b: TreeNode): number {
  const x = Math.min(box(a).r, box(b).r) - Math.max(box(a).l, box(b).l);
  const y = Math.min(box(a).b, box(b).b) - Math.max(box(a).t, box(b).t);
  return x > 4 && y > 4 ? x * y : 0;
}

const ancestors = (p: Placed): Placed[] => {
  const out: Placed[] = [];
  for (let at = p.parent; at; at = at.parent) out.push(at);
  return out;
};

/** a deep look through a value for strings */
const stringsIn = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) stringsIn(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) stringsIn(x, out);
  return out;
};

/* ---------- language ---------- */

const HAN = /\p{Script=Han}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL = /\p{Script=Hangul}/u;

/** Whether a string is written in a language: true, false, or null when it cannot tell (no letters, an address, a
 *  token, a short Latin word that may be a name or a unit in any language). */
export function inLanguage(s: string, lang: Lang): boolean | null {
  const t = s.replace(/\{\{[^}]*\}\}/g, " ").trim();
  if (!/\p{L}/u.test(t) || /^(https?:|data:|mailto:|www\.)/i.test(t) || /\S+@\S+\.\S+/.test(t)) return null;
  const han = HAN.test(t);
  const kana = KANA.test(t);
  const hangul = HANGUL.test(t);
  const latinOnly = !han && !kana && !hangul;
  const letters = (t.match(/\p{L}+/gu) ?? []).join("").length;
  if (lang === "en") return latinOnly;
  if (latinOnly) return letters <= 3 ? null : false;
  if (lang === "zh") return han && !kana && !hangul;
  if (lang === "ja") return (kana || han) && !hangul;
  return hangul;
}

const LANG_NAME: Record<Lang, string> = { en: "English", zh: "Chinese", ja: "Japanese", ko: "Korean" };

/* ---------- the checks ---------- */

/** the tools that only read: a failed read the agent moved on from leaves nothing wrong in the document */
const READS = new Set(createRegistry({ extra: GENERATE_TOOLS }).tools.filter((t) => t.readOnly).map((t) => t.name).concat("load_tools"));

/** the operations a call ran: its own name, or the ops of a batch (when its arguments were kept whole) */
const opsOf = (c: CallRecord): string[] => {
  const batch = c.ops ?? (c.name === "apply_ops" && c.args && typeof c.args === "object" ? (c.args as { ops?: { op?: unknown }[] }).ops?.map((x) => String(x?.op ?? "")) : undefined);
  return Array.isArray(batch) ? batch : [c.name];
};

/** the turn ended on its own and every change that failed was made after all by a later call (the same tool, or a
 *  batch that ran the same operation, or the other way round) */
export const finished = (): Check => ({
  id: "finished",
  label: "ended normally, no error left unrecovered",
  critical: true,
  run(g) {
    const left = g.o.calls.filter((c, i) => {
      /* a removal the author declined is not an error to recover from: the work was meant to stay */
      if (c.ok || READS.has(c.name) || (c.error?.code === "refused" && /drawings?/i.test(c.error.message)) || c.error?.code === "declined") return false;
      const ran = opsOf(c);
      return !g.o.calls.slice(i + 1).some((d) => d.ok && (d.name === c.name || opsOf(d).some((x) => ran.includes(x))));
    });
    const bits = [`stop=${g.o.stop}`, `${g.o.calls.filter((c) => !c.ok).length} failed calls`, ...(left.length ? [`unrecovered: ${left.slice(0, 3).map((c) => `${c.name} (${c.error?.code}: ${(c.error?.message ?? "").slice(0, 60)})`).join("; ")}`] : [])];
    return ok(g.o.stop === "end_turn" && !left.length, bits.join(", "));
  },
});

/** one undo takes the whole turn back to the start */
export const undoOne = (o: { orNothing?: boolean } = {}): Check => ({
  id: "undo",
  label: "one undo restores the start",
  run(g) {
    if (!g.o.undo) return ok(!!o.orNothing, "the turn changed nothing");
    return ok(g.o.undo.steps === 1 && g.o.undo.restores, `${g.o.undo.steps} undo step(s), ${g.o.undo.restores ? "restores the start" : "does not restore the start"}`);
  },
});

/** within the task's step, token and time budget */
export const inBudget = (): Check => ({
  id: "budget",
  label: "within the step/token/time budget",
  run(g) {
    const b = g.o.budget;
    const tokens = g.o.usage.input + g.o.usage.output;
    const over = [g.o.steps > b.steps ? `steps ${g.o.steps}>${b.steps}` : "", tokens > b.tokens ? `tokens ${tokens}>${b.tokens}` : "", g.o.ms > b.ms ? `time ${Math.round(g.o.ms / 1000)}s>${Math.round(b.ms / 1000)}s` : "", g.o.cut ? `cut by ${g.o.cut}` : ""].filter(Boolean);
    return ok(!over.length, over.length ? over.join(", ") : `${g.o.steps} steps, ${tokens} tokens, ${Math.round(g.o.ms / 1000)}s`);
  },
});

/** at least `min` screens were added, one named like `name` when given */
export const newScreen = (o: { min?: number; name?: RegExp } = {}): Check => ({
  id: "screen-added",
  label: o.name ? `a new screen like ${o.name}` : "a new screen",
  critical: true,
  run(g) {
    const added = g.diff.screens.added;
    const named = o.name ? added.filter((s) => o.name!.test(s.name)) : added;
    return ok(added.length >= (o.min ?? 1) && (!o.name || named.length > 0), added.length ? added.map((s) => quote(s.name)).join(", ") : "no screen added");
  },
});

/** at least `min` parts matching `match` on the screens looked at (the touched ones by default) */
export const has = (id: string, label: string, match: (p: Placed, g: Graded) => boolean, o: { min?: number; screens?: string[]; critical?: boolean; weight?: number } = {}): Check => ({
  id,
  label,
  ...(o.critical ? { critical: true } : {}),
  ...(o.weight ? { weight: o.weight } : {}),
  run(g) {
    const screens = screensOf(g, o.screens);
    const found = screens.flatMap((s) => partsOn(g, s)).filter((p) => match(p, g));
    const min = o.min ?? 1;
    return ok(found.length >= min, `${found.length} found (need ${min})${found.length ? `: ${found.slice(0, 4).map((p) => `${p.node.slug}${p.node.kit ? `/${p.node.kit}` : ""} ${quote(p.node.name)}`).join(", ")}` : ""} on ${screens.join(", ") || "no screen"}`);
  },
});

/** slugs (or kits) a part may be */
export const isA =
  (...slugs: string[]) =>
  (p: Placed) =>
    slugs.includes(p.node.slug) || (!!p.node.kit && slugs.includes(p.node.kit));

/** the words the turn wrote are in the task's language */
export const language = (o: { min?: number } = {}): Check => ({
  id: "language",
  label: "new words in the canvas language",
  critical: true,
  run(g) {
    const lang = g.o.lang;
    const judged = g.newWords.map((w) => ({ w, in: inLanguage(w, lang) })).filter((x) => x.in !== null);
    if (!judged.length) return ok(false, "no new words to judge");
    const good = judged.filter((x) => x.in);
    const off = judged.filter((x) => !x.in).map((x) => quote(x.w));
    /* Japanese is told from Chinese by its kana */
    const kana = lang !== "ja" || judged.length < 3 || judged.some((x) => KANA.test(x.w));
    const share = good.length / judged.length;
    return ok(share >= (o.min ?? 0.85) && kana, `${good.length}/${judged.length} in ${LANG_NAME[lang]}${off.length ? `; not: ${off.slice(0, 4).join(", ")}` : ""}${kana ? "" : "; no kana at all"}`);
  },
});

/** the screens show these words (case-insensitive; `min` of them) */
export const shows = (expected: (string | RegExp)[], o: { min?: number; screens?: string[]; critical?: boolean; label?: string } = {}): Check => ({
  id: "shows",
  label: o.label ?? `shows ${expected.length} expected words`,
  ...(o.critical ? { critical: true } : {}),
  run(g) {
    const screens = screensOf(g, o.screens);
    const all = screens.flatMap((s) => wordsOn(g, s)).join("\n").toLowerCase();
    const found = expected.filter((e) => (typeof e === "string" ? all.includes(e.toLowerCase()) : e.test(all)));
    const missing = expected.filter((e) => !found.includes(e)).map(String);
    const min = o.min ?? expected.length;
    return ok(found.length >= min, `${found.length}/${expected.length}${missing.length ? `, missing ${missing.slice(0, 5).join(", ")}` : ""}`);
  },
});

/** no two parts that share a parent (or the screen) cover each other */
export const noOverlap = (o: { screens?: string[] } = {}): Check => ({
  id: "no-overlap",
  label: "no overlapping parts",
  run(g) {
    const screens = screensOf(g, o.screens);
    const hits: string[] = [];
    for (const s of screens) {
      const parts = partsOn(g, s).filter((p) => !floats(p));
      const byParent = new Map<string, Placed[]>();
      for (const p of parts) {
        const k = p.parent?.node.id ?? "";
        byParent.set(k, [...(byParent.get(k) ?? []), p]);
      }
      for (const sibs of byParent.values())
        for (let i = 0; i < sibs.length; i++)
          for (let j = i + 1; j < sibs.length; j++) if (overlap(sibs[i].node, sibs[j].node)) hits.push(`${sibs[i].node.id} ${quote(sibs[i].node.name, 16)} × ${sibs[j].node.id} ${quote(sibs[j].node.name, 16)}`);
    }
    return ok(!hits.length, hits.length ? `${hits.length} overlapping pairs: ${hits.slice(0, 3).join("; ")}` : `none on ${screens.join(", ") || "no screen"}`);
  },
});

/** every part is on its screen, and nothing the turn added is off every screen */
export const inBounds = (o: { screens?: string[] } = {}): Check => ({
  id: "in-bounds",
  label: "nothing out of the screen",
  run(g) {
    const screens = screensOf(g, o.screens);
    const out: string[] = [];
    for (const s of screens) {
      const f = g.doc.frames.find((x) => x.id === s)!;
      const W = frameSizeOf(f).w;
      const L = frameLengthOf(f);
      for (const p of partsOn(g, s)) {
        if (p.node.hidden || p.group?.hidden || roleOfPlaced(p) === "backdrop") continue;
        const b = box(p.node);
        if (b.l < -2 || b.t < -2 || b.r > W + 2 || b.b > L + 2) out.push(`${p.node.id} ${quote(p.node.name, 16)} @${p.node.x},${p.node.y} ${p.node.w}×${p.node.h}`);
      }
    }
    const lost = g.tree.loose.filter((n) => g.addedIds.has(n.id)).map((n) => `${n.id} off every screen`);
    const all = [...out, ...lost];
    return ok(!all.length, all.length ? `${all.length} out: ${all.slice(0, 3).join("; ")}` : "all inside");
  },
});

/** the screens are composed with auto layout: a container lays out several parts, and few atoms lie loose */
export const autoLayout = (o: { screens?: string[]; maxLoose?: number } = {}): Check => ({
  id: "auto-layout",
  label: "auto layout used",
  run(g) {
    const screens = screensOf(g, o.screens);
    const bits: string[] = [];
    let pass = screens.length > 0;
    for (const s of screens) {
      const parts = partsOn(g, s);
      const containers = parts.filter((p) => p.node.layout && p.node.children.filter((c) => c.placed === "flow").length >= 2).length;
      const loose = parts.filter((p) => !p.parent && p.node.tier === "atom" && !p.node.layout && !isBar(p) && !floats(p)).length;
      const inFlow = parts.filter((p) => p.node.placed === "flow").length;
      if (!containers || loose > (o.maxLoose ?? 2)) pass = false;
      bits.push(`${s}: ${containers} layout containers, ${pct(inFlow, parts.length)}% of parts in a layout, ${loose} loose atoms`);
    }
    return ok(pass, bits.join("; ") || "no screen");
  },
});

/** a strict document is still held to its style, and every part keeps to the rules */
export const strictKept = (): Check => ({
  id: "style-rules",
  label: "strict style kept and respected",
  critical: true,
  run(g) {
    const was = g.o.start.theme;
    const now = g.o.final.theme;
    if (!was || !isStrict(was)) return ok(true, "the document is not strict");
    if (!now || !isStrict(now)) return ok(false, "the document is no longer held to its style");
    if (now.style !== was.style) return ok(false, `style changed from ${was.style} to ${now.style}`);
    const all = [...g.o.final.groups, ...(g.o.final.components ?? []).flatMap((c) => c.groups)].flatMap((x) => x.items);
    const bad = all.filter((it) => conformItem(it) !== it);
    return ok(!bad.length, bad.length ? `${bad.length} parts break the rules: ${bad.slice(0, 3).map((it) => it.id).join(", ")}` : `${now.style}, ${all.length} parts keep to it`);
  },
});

/** nothing of the author's was removed (except on the screens named) */
export const keepsWork = (o: { except?: string[]; critical?: boolean } = {}): Check => ({
  id: "keeps-work",
  label: o.except ? "nothing removed elsewhere" : "nothing of the author's removed",
  ...(o.critical ? { critical: true } : {}),
  run(g) {
    const screens = g.diff.screens.removed;
    const startTree = nodeTree(g.o.start, g.o.startWidths);
    const screenOfStart = new Map<string, string>();
    for (const s of startTree.screens) {
      const visit = (n: TreeNode) => {
        screenOfStart.set(n.id, s.id);
        n.children.forEach(visit);
      };
      s.nodes.forEach(visit);
    }
    const nodes = g.diff.nodes.removed.filter((n) => !o.except?.includes(screenOfStart.get(n.id) ?? ""));
    const bits = [screens.length ? `${screens.length} screens removed (${screens.map((s) => quote(s.name)).join(", ")})` : "", nodes.length ? `${nodes.length} parts removed` : ""].filter(Boolean);
    return ok(!screens.length && !nodes.length, bits.join(", ") || "all kept");
  },
});

/** the parts of a screen read as evenly spaced rows with few left edges */
export const evenSpacing = (o: { screen: string; maxEdges?: number; maxSpread?: number }): Check => ({
  id: "even-spacing",
  label: "even gaps and aligned edges",
  run(g) {
    const f = g.doc.frames.find((x) => x.id === o.screen);
    if (!f) return ok(false, `no screen ${o.screen}`);
    const W = frameSizeOf(f).w;
    let rows = partsOn(g, o.screen).filter((p) => !p.parent && !isBar(p) && !floats(p));
    /* a screen built as one column box: its children are the rows */
    for (let i = 0; i < 2 && rows.length === 1 && rows[0].node.layout; i++) rows = partsOn(g, o.screen).filter((p) => p.parent === rows[0] && !floats(p));
    const sorted = [...rows].sort((a, b) => a.node.y - b.node.y);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].node.y - (sorted[i - 1].node.y + sorted[i - 1].node.h);
      if (gap > -4) gaps.push(Math.max(0, gap));
    }
    const edges = new Set(rows.filter((p) => p.node.w < W - 8).map((p) => Math.round(p.node.x / 4)));
    const spread = gaps.length ? Math.max(...gaps) - Math.min(...gaps) : 0;
    const pass = rows.length >= 2 && spread <= (o.maxSpread ?? 24) && edges.size <= (o.maxEdges ?? 3);
    return ok(pass, `${rows.length} rows, gaps ${gaps.map(Math.round).join("/") || "-"} (spread ${Math.round(spread)}), ${edges.size} left edges`);
  },
});

/** a bool variable drives the dark mode */
export const darkVar = (): Check => ({
  id: "dark-var",
  label: "a variable drives the dark mode",
  critical: true,
  run(g) {
    const v = (g.o.final.vars ?? []).find((x) => x.drives === "dark");
    return ok(!!v && v.type === "bool", v ? `${v.id} "${v.name}" ${v.type}` : `no variable with drives: "dark" (vars: ${(g.o.final.vars ?? []).map((x) => x.name).join(", ") || "none"})`);
  },
});

/** effects of a part's taps */
const effectsOf = (it: Item) => [it.action, ...Object.values(it.actions ?? {})].flatMap((a) => (a ? [...(a.effects ?? []), ...(a.else?.effects ?? [])] : []));

/** a control is wired to the dark-mode variable: bound to it, or toggling or setting it when tapped */
export const darkControl = (): Check => ({
  id: "dark-control",
  label: "a switch is wired to it",
  critical: true,
  run(g) {
    const v = (g.o.final.vars ?? []).find((x) => x.drives === "dark");
    if (!v) return ok(false, "no dark-mode variable");
    const wired = g.o.final.groups.flatMap((x) => x.items).filter((it) => Object.values(it.bind ?? {}).includes(v.id) || effectsOf(it).some((e) => (e.do === "toggleVar" || e.do === "setVar") && e.var === v.id));
    return ok(wired.length > 0, wired.length ? wired.map((it) => `${it.id} ${it.component}${it.bind ? ` bind ${JSON.stringify(it.bind)}` : " by tap"}`).join(", ") : "nothing bound to it or setting it");
  },
});

/** a collection was added with at least `rows` rows */
export const collection = (o: { rows: number }): Check => ({
  id: "collection",
  label: `a collection of ${o.rows}+ rows`,
  critical: true,
  run(g) {
    const before = new Set((g.o.start.collections ?? []).map((c) => c.id));
    const made = (g.o.final.collections ?? []).filter((c) => !before.has(c.id));
    const best = made.sort((a, b) => b.rows.length - a.rows.length)[0];
    return ok(!!best && best.rows.length >= o.rows && best.fields.length >= 2, best ? `${best.id} "${best.name}": ${best.fields.join(", ")}; ${best.rows.length} rows` : "none added");
  },
});

/** the containers repeating a new collection */
const repeats = (g: Graded) => {
  const before = new Set((g.o.start.collections ?? []).map((c) => c.id));
  return g.o.final.groups.filter((x) => x.repeat && (g.o.final.collections ?? []).some((c) => c.id === x.repeat!.collection && !before.has(c.id)));
};

export const repeat = (): Check => ({
  id: "repeat",
  label: "a layout repeats it",
  critical: true,
  run(g) {
    const r = repeats(g);
    const held = r.filter((x) => g.o.final.groups.some((y) => y.inFlow === x.id));
    return ok(held.length > 0, r.length ? r.map((x) => `${x.items[0].id} repeats ${x.repeat!.collection}${g.o.final.groups.some((y) => y.inFlow === x.id) ? "" : " (holds nothing)"}`).join(", ") : "no repeat of a new collection");
  },
});

/** a tap in a repeated row opens a screen that reads the tapped row ({{current.field}}) */
export const tapToDetail = (): Check => ({
  id: "tap-detail",
  label: "tapping a row opens a detail screen with its data",
  critical: true,
  run(g) {
    const hosts = new Set(repeats(g).map((x) => x.items[0].id));
    const screens = new Set(g.o.final.frames.map((f) => f.id));
    const inRow = [...g.placed.values()].filter((p) => p.item && [p, ...ancestors(p)].some((a) => hosts.has(a.node.id)));
    const taps = inRow.flatMap((p) => [p.item!.action, ...Object.values(p.item!.actions ?? {})].filter((a) => a && screens.has(a.to)).map((a) => ({ from: p.node.id, to: a!.to, effects: a!.effects ?? [] })));
    if (!taps.length) return ok(false, `no tap in a repeated row opens a screen (${inRow.length} parts in rows)`);
    /* the detail reads the tapped row ({{current.field}}), or variables the tap set from the row's {{field}}s (a
       repeated row's tap is filled in with its row, so that works in the preview too) */
    const current = taps.filter((t) => partsOn(g, t.to).some((p) => stringsIn(p.item?.props).some((s) => /\{\{\s*current\./.test(s))));
    const viaVars = taps.filter((t) => {
      const set = t.effects.flatMap((e) => (e.do === "setVar" && typeof e.value === "string" && e.value.includes("{{") ? [e.var] : []));
      return set.length > 0 && partsOn(g, t.to).some((p) => Object.values(p.item?.bind ?? {}).some((v) => set.includes(v)));
    });
    const how = current.length ? "the detail reads {{current.…}}" : viaVars.length ? "the tap sets variables from the row and the detail shows them" : "the detail shows nothing of the tapped row";
    return ok(current.length + viaVars.length > 0, `${taps.map((t) => `${t.from}→${t.to}`).join(", ")}; ${how}`);
  },
});

/** a number variable a text shows, and taps that add to it and take from it */
export const counter = (): Check => ({
  id: "counter",
  label: "a number variable shown and changed by + and −",
  critical: true,
  run(g) {
    const before = new Set((g.o.start.vars ?? []).map((v) => v.id));
    const vars = (g.o.final.vars ?? []).filter((v) => v.type === "number" && !before.has(v.id));
    const items = g.o.final.groups.flatMap((x) => x.items);
    for (const v of vars) {
      const shown = items.some((it) => Object.values(it.bind ?? {}).includes(v.id) || stringsIn(it.props).some((s) => s.includes(`{{${v.name}}}`) || s.includes(`{{${v.id}}}`)));
      const eff = items.flatMap(effectsOf).filter((e) => "var" in e && e.var === v.id);
      const up = eff.some((e) => e.do === "addVar" && e.by > 0);
      const down = eff.some((e) => (e.do === "addVar" && e.by < 0) || e.do === "setVar");
      if (shown && up && down) return ok(true, `${v.id} "${v.name}": shown, + and − wired`);
      if (vars.length === 1) return ok(false, `${v.id} "${v.name}": ${shown ? "shown" : "not shown"}, ${up ? "+ wired" : "no +"}, ${down ? "− wired" : "no −"}`);
    }
    return ok(false, vars.length ? `${vars.length} number variables, none fully wired` : "no number variable added");
  },
});

/** a new reusable component, built of atoms in auto layout, holding at least the parts asked for */
export const component = (o: { name?: RegExp; needs?: string[][] } = {}): Check => ({
  id: "component",
  label: "a reusable component built from atoms",
  critical: true,
  run(g) {
    const before = new Set((g.o.start.components ?? []).map((c) => c.id));
    const made = (g.o.final.components ?? []).filter((c) => !before.has(c.id));
    if (!made.length) return ok(false, "no component made");
    const bits: string[] = [];
    for (const c of made) {
      const items = c.groups.flatMap((x) => x.items);
      const slugs = items.map((it) => it.component ?? "");
      const atoms = items.filter((it) => {
        const d = partBySlug(it.component);
        return !!d && tierOf(d) === "atom";
      }).length;
      const layout = items.some((it) => it.component === "box" && it.props?.layout && it.props.layout !== "free");
      const missing = (o.needs ?? []).filter((any) => !any.some((s) => slugs.includes(s)));
      const named = !o.name || o.name.test(c.name);
      const good = atoms / Math.max(1, items.length) >= 0.8 && layout && !missing.length && named;
      bits.push(`${c.id} "${c.name}": ${items.length} parts, ${pct(atoms, items.length)}% atoms, ${layout ? "auto layout" : "no layout"}${missing.length ? `, missing ${missing.map((m) => m.join("|")).join(", ")}` : ""}`);
      if (good) return ok(true, bits.join("; "));
    }
    return ok(false, bits.join("; "));
  },
});

/** instances of a component (a new one when no id is given) on a screen */
export const instances = (o: { min: number; component?: string; screen?: string; words?: string[] }): Check => ({
  id: "instances",
  label: `${o.min}+ instances${o.words ? " with their own words" : ""}`,
  critical: true,
  run(g) {
    const before = new Set((g.o.start.components ?? []).map((c) => c.id));
    const ids = o.component ? [o.component] : (g.o.final.components ?? []).filter((c) => !before.has(c.id)).map((c) => c.id);
    const found = g.doc.groups.filter((x) => x.instanceOf && ids.includes(x.instanceOf) && (!o.screen || g.placed.get(x.items[0].id)?.screen === o.screen));
    const said = found.flatMap((x) => Object.values(x.overrides ?? {}).map(String)).join("\n").toLowerCase();
    const missing = (o.words ?? []).filter((w) => !said.includes(w.toLowerCase()));
    return ok(found.length >= o.min && !missing.length, `${found.length} instances${o.screen ? ` on ${o.screen}` : ""}${o.words ? `, overrides ${missing.length ? `miss ${missing.join(", ")}` : "carry every word"}` : ""}`);
  },
});

/** a custom style the document now wears, readable, warm when asked */
export const customStyle = (o: { warm?: boolean } = {}): Check => ({
  id: "custom-style",
  label: `a custom style worn${o.warm ? ", warm" : ""}, contrast kept`,
  critical: true,
  run(g) {
    const key = g.o.final.theme?.style;
    const s = (g.o.final.styles ?? []).find((x) => x.key === key);
    if (!key?.startsWith("custom:") || !s) return ok(false, `wears ${key ?? "Material"}; ${g.o.final.styles?.length ?? 0} custom styles`);
    const was = (g.o.start.styles ?? []).find((x) => x.key === key);
    if (was && JSON.stringify(was) === JSON.stringify(s)) return ok(false, `${key} was already there unchanged`);
    const contrast = contrastProblems(s);
    const hex = (s.light as unknown as Record<string, string>).surface ?? "#888888";
    const [r, , b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const warm = !o.warm || r >= b + 6;
    return ok(!contrast.length && warm, `${key} "${typeof s.name === "string" ? s.name : (s.name as { en?: string }).en}", surface ${hex}${warm ? "" : " (not warm)"}${contrast.length ? `, ${contrast.length} contrast problems` : ""}`);
  },
});

/** a vector part made by the turn, sanitized, inside a part the `inside` test names (a tab bar) */
export const svgPlaced = (o: { inside?: (p: Placed) => boolean; label?: string } = {}): Check => ({
  id: "svg",
  label: o.label ?? "a sanitized SVG placed",
  critical: true,
  run(g) {
    const svgs = [...g.placed.values()].filter((p) => p.node.slug === "svg" && g.addedIds.has(p.node.id) && typeof p.item?.props?.markup === "string" && p.item.props.markup.length > 0);
    if (!svgs.length) return ok(false, "no SVG markup part added");
    const clean = svgs.filter((p) => sanitizeSvg(p.item!.props!.markup as string) !== null);
    const inside = o.inside ? clean.filter((p) => ancestors(p).some(o.inside!)) : clean;
    return ok(inside.length > 0, `${svgs.length} SVG parts, ${clean.length} sanitize, ${inside.length} in place${inside[0] ? ` (${inside[0].node.id}, ${(inside[0].item!.props!.markup as string).length} chars)` : ""}`);
  },
});

/** how alike the best changed screen is to the attached reference */
export const likeness = (o: { min: number }): Check => ({
  id: "likeness",
  label: `likeness to the reference ≥ ${o.min}`,
  weight: 2,
  run(g) {
    const l = g.o.likeness ?? [];
    if (!l.length) return ok(false, "no screen was compared");
    const best = [...l].sort((a, b) => b.similarity - a.similarity)[0];
    return ok(best.similarity >= o.min, `${best.screen}: ${best.similarity}`);
  },
});

/** parts in each corner of a screen: what each corner must hold */
export const corners = (o: { screen?: string; need: Partial<Record<"tl" | "tr" | "bl" | "br", { min: number; match: (p: Placed) => boolean; what: string }>> }): Check => ({
  id: "corners",
  label: `corners hold ${Object.values(o.need).map((n) => n!.what).join(", ")}`,
  critical: true,
  run(g) {
    const screen = o.screen ?? g.touched[0];
    const f = g.doc.frames.find((x) => x.id === screen);
    if (!f) return ok(false, "no screen");
    const { w } = frameSizeOf(f);
    const h = frameSizeOf(f).h;
    const corner = (p: Placed) => {
      const cx = p.node.x + p.node.w / 2;
      const cy = p.node.y + p.node.h / 2;
      return `${cy < h / 2 ? "t" : "b"}${cx < w / 2 ? "l" : "r"}`;
    };
    const parts = partsOn(g, screen).filter((p) => g.addedIds.has(p.node.id));
    let pass = true;
    const bits: string[] = [];
    for (const [k, need] of Object.entries(o.need)) {
      const n = parts.filter((p) => corner(p) === k && need!.match(p)).length;
      if (n < need!.min) pass = false;
      bits.push(`${k} ${need!.what}: ${n}/${need!.min}`);
    }
    return ok(pass, bits.join(", "));
  },
});

/** the answer asks the author something */
export const asks = (): Check => ({
  id: "asks",
  label: "asks or says what it would do",
  run: (g) => ok(/[?？]/.test(g.o.text), g.o.text ? quote(g.o.text.replace(/\s+/g, " "), 120) : "no answer"),
});

/** a custom test of the observation, for what only one task needs */
export const custom = (id: string, label: string, run: (g: Graded) => CheckResult, o: { critical?: boolean; weight?: number } = {}): Check => ({ id, label, run, ...o });

/* ---------- scoring ---------- */

/** what the checks say of a run: each verdict, the weighted share passed, and whether it passes (every critical
 *  check and at least `threshold` of the weight) */
export function score(checks: Check[], o: Observed, threshold = 0.75): { verdicts: Verdict[]; score: number; pass: boolean } {
  const g = grade(o);
  const verdicts = checks.map((c): Verdict => {
    let r: CheckResult;
    try {
      r = inLang(o.lang, () => withDocStyles(o.final.styles, () => c.run(g)));
    } catch (e) {
      r = { pass: false, detail: `grader failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    return { id: c.id, label: c.label, pass: r.pass, detail: r.detail, weight: c.weight ?? 1, critical: !!c.critical };
  });
  const total = verdicts.reduce((n, v) => n + v.weight, 0);
  const got = verdicts.reduce((n, v) => n + (v.pass ? v.weight : 0), 0);
  const s = total ? got / total : 0;
  return { verdicts, score: Math.round(s * 100) / 100, pass: verdicts.every((v) => v.pass || !v.critical) && s >= threshold };
}
