import { CAROUSEL_LAYOUTS, DATE_LAYOUTS, Doc, KIND_ORDER, Kind, TIME_LAYOUTS, VARIANTS, isCardAlign, isCardImagePos, isPlace, isTextToken, isTrackThickness } from "./tokens";

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

/* ---------- the file format ---------- */

/** A document may also come bare, with no envelope, from a link or a hand-written file. */
export const PROJECT_FORMAT = "m3e-project";
export const PROJECT_VERSION = 2;

/** What changes a document from one version to the next, run in order: a change of format adds its
 *  step here under the version it comes from. Each must leave a field it does not know alone. */
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {};

/** the file a document is saved as */
export const projectFile = (doc: Doc) => ({ format: PROJECT_FORMAT, version: PROJECT_VERSION, document: doc });

/** The one way in for a document that comes from outside: a file or a link. Takes it out of its
 *  envelope, brings it up to this version, and returns it only if it then has the shape the editor
 *  relies on. Anything else is refused rather than half understood. */
export function openProject(value: unknown): Doc | null {
  if (!isRecord(value)) return null;
  let doc: unknown = value;
  let version = 0;
  if (value.format !== undefined) {
    if (value.format !== PROJECT_FORMAT) return null;
    doc = value.document;
    version = typeof value.version === "number" ? value.version : 0;
    if (version > PROJECT_VERSION) return null;
  }
  if (!isRecord(doc)) return null;
  for (let v = version; v < PROJECT_VERSION; v++) doc = MIGRATIONS[v]?.(doc as Record<string, unknown>) ?? doc;
  return isProject(doc) ? doc : null;
}

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
