/* The state the document core holds (lib/core/store.ts) and every operation (lib/core/ops) reads and returns: the
 * document as the canvas shows it, the definition open for editing if one is, and what the session knows that is
 * never saved: the selection and the sizes the parts were measured at. Plain data, no React, the same in a browser
 * and in Node. */

import { definitionFrom } from "../instances";
import { resignKits } from "../kits";
import { conformDoc, conformGroups } from "../styleRules";
import { cleanStyles, withDocStyles } from "../styles";
import { DEFAULT_THEME, normalizeTheme, PHONE_W, type Collection, type ComponentDef, type ComponentSet, type Doc, type DocVar, type Frame, type FrameMode, type Group, type Palette, type Theme } from "../tokens";
import { translateDefaultFrameName, type Lang } from "../i18n";
import { translateComponentProps } from "../../parts/registry";

export type Widths = Record<string, number>;

/** who asked for a change: a person in the editor, the in-app agent, an MCP client, or the editor itself keeping the
 *  document in order (a layout pass after a measure, a file read back) */
export type Origin = "user" | "ai" | "mcp" | "system";

/** The document as the canvas shows it. Every field a saved document has, the theme always present. While a
 *  definition is open for editing, `groups` and `frames` are the screen it is edited on, and the document's own wait
 *  in `CoreState.editing`. */
export type DocState = Omit<Doc, "theme"> & { theme: Theme };

/** A definition open for editing: it is edited as the one screen of the canvas, with every tool the canvas has.
 *  The document's own screens, and the mode the canvas was in, wait here until it is closed. */
export type Editing = { id: string; main: { groups: Group[]; frames: Frame[]; mode: FrameMode } };

/** what the session knows and never saves */
export type Session = {
  /** the selected parts, by item id; the last is the one the panel shows */
  selection: string[];
  /** the selected screen, when a screen rather than a part is chosen */
  frameId: string | null;
  /** The sizes parts came out at: `id` its width, `id:h` its height, `id:base` its first baseline. The editor
   *  measures them on the canvas; without one, an operation goes by the parts' own guesses (`Measurer`). */
  widths: Widths;
};

export type CoreState = { doc: DocState; editing: Editing | null; session: Session };

/** everything in a document apart from its screens and parts */
export type DocMeta = Omit<Doc, "groups" | "frames">;

/** An undo step: the screens, parts, definitions and data as they were, plus the rest of the document for a step
 *  that crossed all of it (a style picked, a file opened). */
export type Snapshot = { groups: Group[]; frames: Frame[]; components?: ComponentDef[]; componentSets?: ComponentSet[]; collections?: Collection[]; meta?: DocMeta };

/** How far the parts of a definition stand from the corner of the screen they are edited on, and how much room that
 *  screen leaves around them. The definition itself goes back on its own top left. */
export const DEF_INSET = 40;
export const DEF_ROOM = 240;

/** the id of the screen a definition is edited on */
export const definitionScreenId = (id: string) => `def:${id}`;

export const emptySession = (): Session => ({ selection: [], frameId: null, widths: {} });

/** the state of a document with nothing selected and nothing measured */
export function stateOf(doc: Partial<Doc> & Pick<Doc, "groups" | "frames">, session: Partial<Session> = {}): CoreState {
  return {
    doc: {
      groups: doc.groups,
      frames: doc.frames,
      paletteKey: doc.paletteKey || "purple",
      frame: doc.frame === "blank" ? "blank" : "phone",
      title: doc.title ?? "",
      brief: doc.brief ?? "",
      ...(doc.promptEdit !== undefined ? { promptEdit: doc.promptEdit } : {}),
      ...(doc.promptOptions !== undefined ? { promptOptions: doc.promptOptions } : {}),
      ...(doc.customPalette ? { customPalette: doc.customPalette } : {}),
      dynamicColor: !!doc.dynamicColor,
      theme: normalizeTheme(doc.theme),
      ...(doc.vars ? { vars: doc.vars } : {}),
      ...(doc.components ? { components: doc.components } : {}),
      ...(doc.componentSets ? { componentSets: doc.componentSets } : {}),
      ...(doc.collections ? { collections: doc.collections } : {}),
    },
    editing: null,
    session: { ...emptySession(), ...session },
  };
}

/** The document as it is saved, the same shape and field order the editor has always written: its own screens even
 *  while a definition is open, and that definition as far as it has got. Empty lists of definitions and data are
 *  left out. */
export function savedDoc(s: CoreState): Doc {
  const { doc, editing } = s;
  const defs = editing ? doc.components?.map((c) => (c.id === editing.id ? definitionFrom(c, doc.groups, s.session.widths) : c)) : doc.components;
  return {
    groups: editing ? editing.main.groups : doc.groups,
    frames: editing ? editing.main.frames : doc.frames,
    paletteKey: doc.paletteKey,
    frame: editing ? editing.main.mode : doc.frame,
    title: doc.title,
    brief: doc.brief,
    promptEdit: doc.promptEdit,
    promptOptions: doc.promptOptions,
    customPalette: doc.customPalette ?? undefined,
    dynamicColor: doc.dynamicColor,
    theme: doc.theme,
    vars: doc.vars,
    components: defs?.length ? defs : undefined,
    collections: doc.collections?.length ? doc.collections : undefined,
    styles: doc.styles?.length ? doc.styles : undefined,
    componentSets: doc.componentSets?.length ? doc.componentSets : undefined,
  };
}

/* ---------- small writers ---------- */

/** the state with the canvas's parts replaced */
export const withGroups = (s: CoreState, groups: Group[]): CoreState => (groups === s.doc.groups ? s : { ...s, doc: { ...s.doc, groups } });
/** the state with the canvas's screens replaced */
export const withFrames = (s: CoreState, frames: Frame[]): CoreState => (frames === s.doc.frames ? s : { ...s, doc: { ...s.doc, frames } });
/** the state with some document fields replaced; a field given as undefined is left out */
export function withDoc(s: CoreState, patch: Partial<DocState>): CoreState {
  const doc = { ...s.doc } as Record<string, unknown>;
  let changed = false;
  for (const [k, v] of Object.entries(patch)) {
    if (doc[k] === v && (v !== undefined || !(k in doc))) continue;
    changed = true;
    if (v === undefined) delete doc[k];
    else doc[k] = v;
  }
  return changed ? { ...s, doc: doc as DocState } : s;
}
export const withSession = (s: CoreState, patch: Partial<Session>): CoreState => ({ ...s, session: { ...s.session, ...patch } });

/** The browser's own copy skips `openProject`: anything but a part cannot be drawn. */
export const drawableGroups = (groups: Group[]): Group[] => groups.map((g) => ({ ...g, items: g.items.filter((it) => (it.kind as string) === "component") })).filter((g) => g.items.length > 0);

/** What a stored or opened document does to the state: its fields come in under the rules of its theme. Fields a
 *  partial document leaves out keep their value, or go back to their default when `reset`. A definition open for
 *  editing is closed, since the document it belonged to is gone. The canvas's mode (screens or a blank canvas) is
 *  not read here: the device decides it on load, and opening a file sets it on its own (`DocStore.replace`).
 *  The document's own styles come first, cleaned (lib/styles/custom.ts): its theme may name one of them, and it is
 *  read against them. */
export function loadInto(s: CoreState, doc: Partial<Doc>, reset: boolean): CoreState {
  const styles = doc.styles !== undefined || reset ? cleanStyles(doc.styles) : s.doc.styles;
  return withDocStyles(styles, () => {
    const out = readInto(s, doc, reset);
    if (doc.styles !== undefined || reset) {
      if (styles === undefined) delete out.styles;
      else out.styles = styles;
    }
    return { ...s, doc: out as DocState, editing: null };
  });
}

function readInto(s: CoreState, doc: Partial<Doc>, reset: boolean): Record<string, unknown> {
  const look = doc.theme && typeof doc.theme === "object" ? normalizeTheme(doc.theme) : reset ? normalizeTheme(undefined) : s.doc.theme;
  const out: Record<string, unknown> = { ...s.doc };
  const set = (k: keyof DocState, v: unknown) => {
    if (v === undefined) delete out[k];
    else out[k] = v;
  };
  if (Array.isArray(doc.groups)) set("groups", drawableGroups(conformGroups(doc.groups, look)));
  if (Array.isArray(doc.components)) set("components", conformDoc({ groups: [], components: doc.components }, look).components);
  else if (reset) set("components", undefined);
  if (Array.isArray(doc.componentSets)) set("componentSets", doc.componentSets);
  else if (reset) set("componentSets", undefined);
  if (Array.isArray(doc.collections)) set("collections", doc.collections);
  else if (reset) set("collections", undefined);
  if (Array.isArray(doc.frames)) set("frames", doc.frames);
  if (typeof doc.paletteKey === "string" && doc.paletteKey) set("paletteKey", doc.paletteKey);
  else if (reset) set("paletteKey", "purple");
  if (doc.customPalette && typeof doc.customPalette.primary === "string") set("customPalette", doc.customPalette);
  else if (reset) set("customPalette", undefined);
  if (typeof doc.dynamicColor === "boolean") set("dynamicColor", doc.dynamicColor);
  else if (reset) set("dynamicColor", false);
  if ((doc.theme && typeof doc.theme === "object") || reset) set("theme", look);
  if (typeof doc.title === "string") set("title", doc.title);
  else if (reset) set("title", "");
  if (typeof doc.brief === "string") set("brief", doc.brief);
  else if (reset) set("brief", "");
  if (typeof doc.promptEdit === "string") set("promptEdit", doc.promptEdit);
  else if (reset) set("promptEdit", undefined);
  if (Array.isArray(doc.promptOptions)) set("promptOptions", doc.promptOptions);
  else if (reset) set("promptOptions", undefined);
  if (Array.isArray(doc.vars)) set("vars", doc.vars);
  else if (reset) set("vars", undefined);
  return out;
}

/* ---------- history snapshots ---------- */

/** The current step as a snapshot: the canvas's screens, parts, definitions and data; with `whole`, the whole
 *  document as it is saved (its own screens, even from inside a definition). */
export function snapshotOf(s: CoreState, whole: boolean): Snapshot {
  if (whole) {
    const { groups, frames, ...meta } = savedDoc(s);
    return { groups, frames, components: meta.components, componentSets: meta.componentSets, collections: meta.collections, meta };
  }
  return { groups: s.doc.groups, frames: s.doc.frames, components: s.doc.components, componentSets: s.doc.componentSets, collections: s.doc.collections };
}

/** A step put back: the screens, parts, definitions and data it holds; one that crossed the whole document brings
 *  all of it back, as an opened file comes in. */
export function restoreSnapshot(s: CoreState, snap: Snapshot, pinMode: FrameMode | null): CoreState {
  if (snap.meta) {
    const loaded = loadInto(s, { ...snap.meta, groups: snap.groups, frames: snap.frames }, true);
    const mode: FrameMode = pinMode ?? (snap.meta.frame === "blank" ? "blank" : "phone");
    /* what was measured was measured in the other style, and a kit composed again keeps its box's id */
    return { ...loaded, doc: { ...loaded.doc, frame: mode }, session: { ...loaded.session, widths: {} } };
  }
  const doc = { ...s.doc, groups: snap.groups, frames: snap.frames } as Record<string, unknown>;
  if (snap.components === undefined) delete doc.components;
  else doc.components = snap.components;
  if (snap.componentSets === undefined) delete doc.componentSets;
  else doc.componentSets = snap.componentSets;
  if (snap.collections === undefined) delete doc.collections;
  else doc.collections = snap.collections;
  return { ...s, doc: doc as DocState };
}

/** A step in another language: the seed words of its parts and the default names of its screens follow, as they
 *  do on the canvas. Words put in another language are no one's change: a kit stays the kit it was added as. */
export function translateSnapshot(snap: Snapshot, lang: Lang, theme?: Theme): Snapshot {
  const groups = translateGroups(snap.groups, lang);
  return {
    ...snap,
    groups: resignKits(snap.groups, groups, theme ?? snap.meta?.theme),
    frames: snap.frames.map((frame) => ({ ...frame, name: translateDefaultFrameName(frame.name, lang) })),
  };
}

const translateGroups = (groups: Group[], lang: Lang): Group[] =>
  groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      /* a part keeps its seed text in `props` */
      props: translateComponentProps(item.component, item.props, lang),
    })),
  }));

/* ---------- reading ---------- */

/** the theme of the document, as it always is in the state */
export const themeOf = (s: CoreState): Theme => s.doc.theme ?? DEFAULT_THEME;

/** the vars of the document, never undefined */
export const varsOf = (s: CoreState): DocVar[] => s.doc.vars ?? [];

/** the screen a definition is edited on: room around its parts, never narrower than a phone */
export const definitionScreen = (def: ComponentDef): Frame => ({ id: definitionScreenId(def.id), name: def.name, x: 0, y: 0, w: Math.max(def.w + DEF_ROOM, PHONE_W), h: Math.max(def.h + DEF_ROOM, 480) });

export type { Palette };
