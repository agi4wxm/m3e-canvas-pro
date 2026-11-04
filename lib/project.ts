import { CAROUSEL_LAYOUTS, DATE_LAYOUTS, Doc, GAP, Item, KIND_ORDER, Kind, TIME_LAYOUTS, VARIANTS, framePresetPatch, isCardAlign, isCardImagePos, isPlace, isTextToken, isTrackThickness, sizeOf } from "./tokens";
import { schemeFromSeed } from "./color";
import { PROP_UPGRADES, RETIRED_PARTS, foreignKindOf, isDrawnKind, packOfSlug } from "../parts/packs";

/* A project file is the Doc as JSON, nothing more. Reading one back only checks
 * the shape the editor relies on; the same migrations that run on a saved
 * document then bring an older file up to date. */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const KINDS = new Set<string>(KIND_ORDER);

const validTabs = (tabs: unknown) =>
  tabs === undefined || (Array.isArray(tabs) && tabs.every((tab) => isRecord(tab) && typeof tab.label === "string" && (typeof tab.icon === "string" || tab.icon === null || tab.icon === undefined) && (tab.src === undefined || typeof tab.src === "string")));

const validCorners = (c: unknown) => c === undefined || (isRecord(c) && ["tl", "tr", "bl", "br"].every((k) => Number.isFinite(c[k])));

/** the layouts a carousel and the two pickers may be saved with */
const LAYOUTS = new Set<string>([...CAROUSEL_LAYOUTS, ...DATE_LAYOUTS, ...TIME_LAYOUTS].map((l) => l.key));
const optionalNumber = (v: unknown) => v === undefined || Number.isFinite(v);

const validItem = (item: unknown) =>
  isRecord(item) &&
  validCorners(item.corners) &&
  (item.railExpanded === undefined || typeof item.railExpanded === "boolean") &&
  (item.railModal === undefined || typeof item.railModal === "boolean") &&
  (item.collapseOnScroll === undefined || typeof item.collapseOnScroll === "boolean") &&
  (item.trackThickness === undefined || isTrackThickness(item.trackThickness)) &&
  (item.imagePos === undefined || isCardImagePos(item.imagePos)) &&
  (item.imageSize === undefined || (Number.isFinite(item.imageSize) && (item.imageSize as number) > 0)) &&
  (item.contentAlign === undefined || isCardAlign(item.contentAlign)) &&
  (item.textAlign === undefined || isCardAlign(item.textAlign)) &&
  (item.textColor === undefined || isTextToken(item.textColor)) &&
  typeof item.id === "string" &&
  typeof item.kind === "string" &&
  KINDS.has(item.kind as Kind) &&
  typeof item.label === "string" &&
  (typeof item.icon === "string" || item.icon === null) &&
  VARIANTS.some((variant) => variant.key === item.variant) &&
  (item.supporting === undefined || typeof item.supporting === "string") &&
  (item.selected === undefined || Number.isFinite(item.selected)) &&
  (item.note === undefined || typeof item.note === "string") &&
  (item.layout === undefined || (typeof item.layout === "string" && LAYOUTS.has(item.layout))) &&
  optionalNumber(item.count) &&
  (item.component === undefined || typeof item.component === "string") &&
  (item.props === undefined || isRecord(item.props)) &&
  (item.foreign === undefined || isRecord(item.foreign)) &&
  optionalNumber(item.size) &&
  optionalNumber(item.size2) &&
  optionalNumber(item.radiusTop) &&
  optionalNumber(item.radiusBottom) &&
  optionalNumber(item.value) &&
  validTabs(item.tabs);

const validGroup = (group: unknown) =>
  isRecord(group) &&
  typeof group.id === "string" &&
  Number.isFinite(group.x) &&
  Number.isFinite(group.y) &&
  (group.axis === "x" || group.axis === "y") &&
  (group.locked === undefined || typeof group.locked === "boolean") &&
  Array.isArray(group.items) &&
  group.items.length > 0 &&
  group.items.every(validItem);

const validFrame = (frame: unknown) =>
  isRecord(frame) &&
  typeof frame.id === "string" &&
  typeof frame.name === "string" &&
  Number.isFinite(frame.x) &&
  Number.isFinite(frame.y) &&
  (frame.w === undefined || (Number.isFinite(frame.w) && (frame.w as number) > 0)) &&
  (frame.h === undefined || (Number.isFinite(frame.h) && (frame.h as number) > 0)) &&
  (frame.note === undefined || typeof frame.note === "string") &&
  (frame.place === undefined || isPlace(frame.place)) &&
  (frame.length === undefined || (Number.isFinite(frame.length) && (frame.length as number) > 0));

/** sketches saved before the prompt was web-only carry the target they picked; it is read and ignored */
const isLegacyPlatform = (v: unknown) => v === "android" || v === "web";

/** whether a parsed file has the shape of a document the editor can open */
export const isProject = (value: unknown): value is Doc =>
  isRecord(value) && Array.isArray(value.groups) && Array.isArray(value.frames) && value.groups.every(validGroup) && value.frames.every(validFrame) && (value.platform === undefined || isLegacyPlatform(value.platform)) && (value.promptOptions === undefined || (Array.isArray(value.promptOptions) && value.promptOptions.every((o) => typeof o === "string")));

/** the slug of a stand-in for a kind nothing here can draw */
export const FOREIGN_PREFIX = "foreign/";

/** Parts saved under a kind this editor does not have (a fork's, or a later version's). A kind a
 *  pack stands for opens as the pack's part. Any other is kept as a stand-in of the same size, so
 *  one part nobody knows no longer costs the whole file. Either way the part as it was saved stays
 *  whole in `foreign`, and a stand-in becomes the real part once its pack is here. Safe to run on
 *  an item more than once; a part this editor knows comes back as the same object. */
/** Where a fork's part goes when tapped: a prototype's flow must survive the move. Forks of this
 *  editor save `action` and `actions` as they are here; Miuix saves `to` and `transition`. */
function actionsOfForeign(foreign: Record<string, unknown>) {
  const tabs = Array.isArray(foreign.tabs) ? foreign.tabs : [];
  const tabActions = Object.fromEntries(tabs.flatMap((t, i) => (isRecord(t) && typeof t.to === "string" ? [[`tab:${i}`, { to: t.to, transition: t.transition ?? "slide" }]] : [])));
  const actions = isRecord(foreign.actions) ? foreign.actions : Object.keys(tabActions).length ? tabActions : undefined;
  const action = isRecord(foreign.action) ? foreign.action : typeof foreign.to === "string" ? { to: foreign.to, transition: foreign.transition ?? "slide" } : undefined;
  return { ...(action ? { action } : {}), ...(actions ? { actions } : {}) };
}

/** A part merged into another opens as what it became, and keeps everything else it has: its place
 *  in the flow, its note, what it was adopted from. A part whose props changed shape is read anew. */
function currentPart(item: Record<string, unknown>): Record<string, unknown> {
  if (item.kind !== "component" || typeof item.component !== "string") return item;
  const props = isRecord(item.props) ? item.props : {};
  const retired = RETIRED_PARTS[item.component];
  if (retired) {
    if (isDrawnKind(retired)) return { ...item, component: retired.slug, props: retired.props(props) };
    const { component: _component, props: _props, ...rest } = item;
    return { ...rest, kind: retired.kind, ...retired.fields(props) };
  }
  const upgraded = isRecord(item.props) ? PROP_UPGRADES[item.component]?.(item.props) : undefined;
  return upgraded && upgraded !== item.props ? { ...item, props: upgraded } : item;
}

export function adoptForeignItem(raw: unknown): unknown {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.kind !== "string" || !raw.kind) return raw;
  const item = currentPart(raw);
  const standIn = item.kind === "component" && typeof item.component === "string" && item.component.startsWith(FOREIGN_PREFIX) && isRecord(item.foreign);
  /* A kind of the same name from another dialect (GPUI's button has variant "default", Miuix's fab
     has no label): the name is ours but the part is not. A bad value in a field we do read is still
     a broken file, and `isProject` refuses it. */
  const native = KINDS.has(String(item.kind));
  const otherDialect = item.kind !== "component" && native && (typeof item.label !== "string" || !VARIANTS.some((v) => v.key === item.variant));
  if (native && !standIn && !otherDialect) return item;
  const foreign = (standIn ? item.foreign : item) as Record<string, unknown>;
  const kind = String(foreign.kind);
  const known = foreignKindOf(foreign);
  const base = { id: item.id, kind: "component", label: typeof foreign.label === "string" ? foreign.label : "", icon: null, variant: "filled", ...(typeof foreign.note === "string" ? { note: foreign.note } : {}), ...actionsOfForeign(foreign), foreign };
  if (known) return isDrawnKind(known) ? { ...base, component: known.slug, props: known.props(foreign) } : { ...base, kind: known.kind, ...known.fields(foreign) };
  if (standIn) return item;
  /* Miuix calls its measures w and h */
  const w = foreign.size ?? foreign.w;
  const h = foreign.size2 ?? foreign.h;
  return { ...base, component: `${FOREIGN_PREFIX}${kind}`, props: {}, ...(typeof w === "number" ? { size: w } : {}), ...(typeof h === "number" ? { size2: h } : {}) };
}

/** a part that draws its own `children`: the game fork's inventory draws them as its cells */
const DRAWS_ITS_CHILDREN = new Set(["invGrid"]);

/** Two forks nest. GPUI groups hold groups (`children`, placed from the group's corner), and the
 *  game fork's parts hold parts (`children`, placed from the part's corner). Here what a container
 *  holds is what lies inside it and over it (`heldBy`), so each comes out to the top level at the
 *  place it was drawn, right after the thing it was in. Nothing keeps a `children` afterwards, so
 *  a file saved from here does not spread twice. */
function spreadNested(value: Record<string, unknown>) {
  if (!Array.isArray(value.groups)) return value;
  const out: unknown[] = [];
  const visit = (g: unknown, ox: number, oy: number) => {
    if (!isRecord(g) || !Array.isArray(g.items)) return void out.push(g);
    const { children, ...group } = g;
    const x = ox + (Number(g.x) || 0);
    const y = oy + (Number(g.y) || 0);
    const inside: [unknown, number, number][] = [];
    let along = 0;
    const items = g.items.map((item: unknown) => {
      if (!isRecord(item)) return item;
      const pos = isRecord(g.pos) && isRecord(g.pos[String(item.id)]) ? (g.pos[String(item.id)] as Record<string, unknown>) : undefined;
      const at = g.free ? { x: x + (Number(pos?.x) || 0), y: y + (Number(pos?.y) || 0) } : g.axis === "y" ? { x, y: y + along } : { x: x + along, y };
      /* a part that is no part at all has no size: the check further on refuses the file */
      const adopted = adoptForeignItem(item);
      if (isRecord(adopted) && KINDS.has(String(adopted.kind))) {
        const size = sizeOf(adopted as unknown as Item, {});
        along += (g.axis === "y" ? size.h : size.w) + GAP;
      }
      if (!Array.isArray(item.children) || DRAWS_ITS_CHILDREN.has(String(item.kind))) return item;
      for (const child of item.children) {
        if (!isRecord(child)) continue;
        const { x: cx, y: cy, ...part } = child;
        inside.push([{ id: `g-${String(child.id)}`, x: cx, y: cy, axis: "x", items: [part] }, at.x, at.y]);
      }
      const { children: _children, ...rest } = item;
      return rest;
    });
    out.push({ ...group, x, y, items });
    for (const [child, cx, cy] of inside) visit(child, cx, cy);
    if (Array.isArray(children)) for (const child of children) visit(child, x, y);
  };
  for (const g of value.groups) visit(g, 0, 0);
  return { ...value, groups: out };
}

const adoptItems = (value: Record<string, unknown>) =>
  Array.isArray(value.groups) ? { ...value, groups: value.groups.map((g) => (isRecord(g) && Array.isArray(g.items) ? { ...g, items: g.items.map(adoptForeignItem) } : g)) } : value;

/* ---------- the file format ---------- */

/** Version 1 is the envelope two forks already write; version 2 adds `packs`. A document with no
 *  envelope is what every other version of this editor saved. */
export const PROJECT_FORMAT = "m3e-project";
export const PROJECT_VERSION = 2;

/** What changes a document from one version to the next, run in order: a change of format adds its
 *  step here under the version it comes from. Each must leave a field it does not know alone. */
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {};

/** the pack each part of a document needs and the version it was saved with */
export const packsOfDoc = (doc: Doc): Record<string, string> =>
  Object.fromEntries(doc.groups.flatMap((g) => g.items.map((it) => packOfSlug(it.component))).filter((p) => !!p).map((p) => [p.id, p.version]));

/** the file a document is saved as */
export const projectFile = (doc: Doc) => ({ format: PROJECT_FORMAT, version: PROJECT_VERSION, packs: packsOfDoc(doc), document: doc });

/** A Miuix Canvas project: screens that hold their own parts, placed relative to the screen, one
 *  seed for the colors. Here a screen is a frame, and each part stands in a group of its own at its
 *  place on the board. Its parts then come through adoption like any other fork's. */
function fromMiuixProject(value: Record<string, unknown>): Record<string, unknown> | null {
  const screens = value.screens;
  if (!Array.isArray(screens) || !screens.every((s) => isRecord(s) && Array.isArray(s.items))) return null;
  const theme = isRecord(value.theme) ? value.theme : {};
  const seed = typeof theme.seed === "string" && /^#[0-9a-f]{6}$/i.test(theme.seed) ? theme.seed : undefined;
  const { screens: _screens, theme: _theme, version: _version, ...rest } = value;
  return {
    ...rest,
    title: typeof value.title === "string" ? value.title : "",
    brief: typeof value.brief === "string" ? value.brief : "",
    frame: "phone",
    paletteKey: seed ? "custom" : "purple",
    ...(seed ? { customPalette: schemeFromSeed(seed, "Miuix") } : {}),
    theme: { dark: theme.mode === "dark" },
    dynamicColor: theme.monet === true,
    frames: screens.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      x: s.x,
      y: s.y,
      ...(s.preset === "desktop" ? framePresetPatch("desktop") : {}),
      ...(typeof s.note === "string" ? { note: s.note } : {}),
      ...(isRecord(s.swipe) ? { swipe: s.swipe } : {}),
    })),
    groups: screens.flatMap((s: Record<string, unknown>) =>
      (s.items as Record<string, unknown>[]).map((it) => ({ id: `g-${String(it.id)}`, x: Number(s.x) + Number(it.x ?? 0), y: Number(s.y) + Number(it.y ?? 0), axis: "x", items: [it] })),
    ),
  };
}

/** A SwiftUI canvas project: screens with no parts of their own and one list of parts, each naming
 *  its screen (none: it lies on the board). It is told from Miuix by that list, and its parts speak
 *  no other way the adoption could recognize, so each is marked. An iPhone is 393 by 852; the look
 *  it was given (shape, font, an accent by preset name) stays in `swiftUITheme`, unread. There was
 *  no way to run that fork here: this follows its types, not a file it wrote. */
function fromSwiftUIProject(value: Record<string, unknown>): Record<string, unknown> | null {
  const { screens, parts } = value;
  if (!Array.isArray(screens) || !Array.isArray(parts) || !screens.every(isRecord) || !parts.every(isRecord)) return null;
  const theme = isRecord(value.theme) ? value.theme : {};
  const seed = typeof theme.accent === "string" && /^#[0-9a-f]{6}$/i.test(theme.accent) ? theme.accent : undefined;
  const at = new Map(screens.map((s: Record<string, unknown>) => [s.id, s]));
  const { screens: _screens, parts: _parts, theme: _theme, version: _version, ...rest } = value;
  return {
    ...rest,
    title: typeof value.title === "string" ? value.title : "",
    brief: typeof value.brief === "string" ? value.brief : "",
    frame: "phone",
    paletteKey: seed ? "custom" : "purple",
    ...(seed ? { customPalette: schemeFromSeed(seed, "SwiftUI") } : {}),
    theme: { dark: theme.scheme === "dark" },
    swiftUITheme: theme,
    frames: screens.map((s: Record<string, unknown>) => ({ id: s.id, name: s.name, x: s.x, y: s.y, w: 393, h: 852, ...(typeof s.note === "string" ? { note: s.note } : {}) })),
    groups: parts.map((part: Record<string, unknown>) => {
      const screen = at.get(part.screen);
      const link = isRecord(part.link) ? part.link : undefined;
      const options = Array.isArray(part.options) ? part.options : undefined;
      const item = {
        ...part,
        dialect: "swiftui",
        ...(options ? { tabs: options.map((o) => (isRecord(o) ? { ...o, ...(typeof o.target === "string" ? { to: o.target } : {}) } : o)) } : {}),
        ...(typeof link?.target === "string" ? { to: link.target, transition: link.transition } : {}),
      };
      return { id: `g-${String(part.id)}`, x: Number(screen?.x ?? 0) + Number(part.x ?? 0), y: Number(screen?.y ?? 0) + Number(part.y ?? 0), axis: "x", items: [item] };
    }),
  };
}

/** The one way in for a document that comes from outside: a file or a link. Takes it out of its
 *  envelope, brings it up to this version, adopts the parts this editor does not know, and returns
 *  it only if it then has the shape the editor relies on. A file from a later version is refused
 *  rather than half understood. */
export function openProject(value: unknown): Doc | null {
  if (!isRecord(value)) return null;
  let doc: unknown = value;
  let version = 0;
  if (typeof value.format === "string") {
    /* a fork's envelope: the same idea under its own name */
    doc = value.document ?? value.doc;
    version = typeof value.version === "number" ? value.version : 0;
    if (version > PROJECT_VERSION) return null;
  }
  if (!isRecord(doc)) return null;
  if (Array.isArray(doc.screens) && !Array.isArray(doc.groups)) {
    doc = Array.isArray(doc.parts) ? fromSwiftUIProject(doc) : fromMiuixProject(doc);
    if (!doc) return null;
    version = PROJECT_VERSION;
  }
  for (let v = version; v < PROJECT_VERSION; v++) doc = MIGRATIONS[v]?.(doc as Record<string, unknown>) ?? doc;
  let next = adoptItems(spreadNested(doc as Record<string, unknown>));
  /* a fork's own target (iOS): the editor reads none, and one it does not know is no reason to refuse the file */
  if (typeof next.platform === "string" && !isLegacyPlatform(next.platform)) {
    const { platform, ...rest } = next;
    next = { ...rest, foreignPlatform: platform };
  }
  return isProject(next) ? next : null;
}

const DOC_FIELDS = new Set(["groups", "frames", "paletteKey", "customPalette", "dynamicColor", "frame", "platform", "title", "brief", "promptEdit", "promptOptions", "theme"]);

/** the fields of a document this editor has no use for: it carries them back out when it saves */
export const unknownDocFields = (doc: object) => Object.fromEntries(Object.entries(doc).filter(([k]) => !DOC_FIELDS.has(k)));

/** the file name a project is saved under: m3e-canvas, followed by the app's name when it has one */
export const projectFileName = (doc: Doc) => {
  const name = doc.title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name ? `m3e-canvas ${name}.json` : "m3e-canvas.json";
};

/** hands the document to the browser as a JSON download */
export function saveProject(doc: Doc) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(projectFile(doc), null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = projectFileName(doc);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** reads a chosen file back into a document, or null when it is not one */
export async function readProject(file: File): Promise<Doc | null> {
  try {
    return openProject(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
