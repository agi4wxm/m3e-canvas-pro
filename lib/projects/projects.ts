/* Projects as the person sees them: made, named, copied, put in the bin and taken back out, listed and searched. The
 * listing changes are told to every tab of this browser, so a projects home open elsewhere follows. What is kept and
 * how is lib/projects/db.ts. */

import { assetRefsIn, stripAssets } from "../assets";
import type { Doc } from "../tokens";
import { PROJECT_VERSION, newerOriginalOf, newerVersionOf } from "../project";
import { copyProjectRecords, deleteKv, deleteProjectRecords, listProjects, patchProject, pruneAssets, putNewProject, type ProjectMeta } from "./db";

export type { ProjectMeta } from "./db";

/** the query parameter a tab's project is named by */
export const PROJECT_PARAM = "project";
/** the Web Lock the tab editing a project holds */
export const lockName = (id: string) => `m3e:project:${id}`;
/** how long a project put in the bin can still be taken back */
export const UNDO_DELETE_MS = 8000;

/** a new project's id: short, random, safe in a URL */
export function newProjectId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("") + Date.now().toString(36).slice(-4);
}

/** what the listing says of a document: how many screens it has and the style it wears */
export const summaryOf = (doc: Partial<Doc>): Pick<ProjectMeta, "screens" | "style"> => ({ screens: Array.isArray(doc.frames) ? doc.frames.length : 0, ...(doc.theme?.style ? { style: doc.theme.style } : {}) });

/** A document as the store keeps it: JSON with its large pictures as references, those pictures, and the format
 *  version it is written in. One a newer version wrote is kept as it came, under its own version, so a project made
 *  of it loses nothing this version does not understand (lib/project.ts `loadDocument`). */
export function storedForm(doc: unknown): { json: string; refs: string[]; assets: Map<string, string>; version: number } {
  const { doc: light, found } = stripAssets(newerOriginalOf(doc) ?? doc);
  return { json: JSON.stringify(light), refs: [...assetRefsIn(light)], assets: found, version: newerVersionOf(doc) ?? PROJECT_VERSION };
}

/* ---------- names ---------- */

/** `base`, or `base 2`, `base 3`… whichever no listed project is called yet */
export function freeName(base: string, list: readonly Pick<ProjectMeta, "name" | "deleted">[]): string {
  const taken = new Set(list.filter((m) => !m.deleted).map((m) => m.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

/* ---------- listing ---------- */

export type ProjectSort = "recent" | "name" | "created";

/** when a project was last in use: edited or opened */
export const lastUsed = (m: ProjectMeta) => Math.max(m.updated, m.opened ?? 0);

/** the projects to list: those not in the bin, matching every word of the query by name, in the order asked */
export function visibleProjects(list: readonly ProjectMeta[], o: { query?: string; sort?: ProjectSort; lang?: string } = {}): ProjectMeta[] {
  const words = (o.query ?? "").toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const shown = list.filter((m) => !m.deleted && words.every((w) => m.name.toLocaleLowerCase().includes(w)));
  const collator = new Intl.Collator(o.lang, { numeric: true, sensitivity: "base" });
  const by: Record<ProjectSort, (a: ProjectMeta, b: ProjectMeta) => number> = {
    recent: (a, b) => lastUsed(b) - lastUsed(a) || b.created - a.created,
    name: (a, b) => collator.compare(a.name, b.name) || lastUsed(b) - lastUsed(a),
    created: (a, b) => b.created - a.created,
  };
  return shown.sort(by[o.sort ?? "recent"]);
}

/** the project a tab opens when it is not told which: the one last in use */
export const mostRecent = (list: readonly ProjectMeta[]) => visibleProjects(list)[0];

/* ---------- telling the other tabs ---------- */

const CHANNEL = "m3e:projects";
const here = new Set<() => void>();
let channel: BroadcastChannel | null | undefined;
const bus = () => {
  if (channel === undefined) channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
  return channel;
};

/** says that the projects changed, to this tab and the others */
export function tellProjectsChanged() {
  for (const fn of here) fn();
  try {
    bus()?.postMessage("changed");
  } catch {}
}

/** listens for changes of the projects, made in this tab or another; returns the unsubscribe */
export function onProjectsChanged(fn: () => void): () => void {
  here.add(fn);
  const b = bus();
  const heard = () => fn();
  b?.addEventListener("message", heard);
  return () => {
    here.delete(fn);
    b?.removeEventListener("message", heard);
  };
}

/* ---------- changes ---------- */

/** A new project, empty (the editor starts it from its starter sketch) or holding `doc`. */
export async function createProject(o: { name: string; doc?: Doc; now?: number; id?: string; outside?: ProjectMeta["outside"] }): Promise<ProjectMeta> {
  const now = o.now ?? Date.now();
  const meta: ProjectMeta = { id: o.id ?? newProjectId(), name: o.name, created: now, updated: now, screens: 0, ...(o.doc ? summaryOf(o.doc) : {}), ...(o.outside ? { outside: o.outside } : {}) };
  await putNewProject(meta, o.doc ? storedForm(o.doc) : undefined);
  tellProjectsChanged();
  return meta;
}

export async function renameProject(id: string, name: string): Promise<ProjectMeta | undefined> {
  const clean = name.trim();
  if (!clean) return undefined;
  const meta = await patchProject(id, { name: clean });
  tellProjectsChanged();
  return meta;
}

/** a copy of a project, named after it, listed as new */
export async function duplicateProject(id: string, name: string, now = Date.now()): Promise<ProjectMeta | undefined> {
  const was = (await listProjects()).find((m) => m.id === id);
  if (!was) return undefined;
  const { file: _file, deleted: _deleted, opened: _opened, ...rest } = was;
  const meta: ProjectMeta = { ...rest, id: newProjectId(), name, created: now, updated: now };
  if (!(await copyProjectRecords(id, meta))) return undefined;
  tellProjectsChanged();
  return meta;
}

/** puts a project in the bin: hidden from the list, gone for good once `purgeProject` runs */
export async function trashProject(id: string, now = Date.now()) {
  await patchProject(id, { deleted: now });
  tellProjectsChanged();
}

/** takes a project back out of the bin */
export async function restoreProject(id: string) {
  await patchProject(id, (m) => {
    const { deleted: _gone, ...rest } = m;
    return rest;
  });
  tellProjectsChanged();
}

/** the key the agent's conversation with a project is kept under in the kv store (src/editor/agentMemory.ts) */
export const agentConversationKey = (id: string) => `agent:conversation:${id}`;

/** What a project keeps in the kv store beside its records, forgotten with it. Kept apart from the records' own
 *  transaction: a key left behind by a failure here is only a little unused data. */
const projectKvKeys = (id: string) => [agentConversationKey(id)];
const forgetProjectKv = (id: string) => deleteKv(projectKvKeys(id)).catch(() => {});

/** forgets a project for good, what it kept beside it, and the pictures only it used */
export async function purgeProject(id: string) {
  await deleteProjectRecords(id);
  await forgetProjectKv(id);
  await pruneAssets().catch(() => 0);
  tellProjectsChanged();
}

/** Forgets the projects left in the bin longer than their undo lasts (a tab closed before it ran out). */
export async function purgeTrashed(now = Date.now()) {
  const old = (await listProjects()).filter((m) => m.deleted !== undefined && now - m.deleted > UNDO_DELETE_MS * 2);
  for (const m of old) {
    await deleteProjectRecords(m.id);
    await forgetProjectKv(m.id);
  }
  if (old.length) {
    await pruneAssets().catch(() => 0);
    tellProjectsChanged();
  }
}

/** The projects some tab of this browser is editing now, by the locks those tabs hold. */
export async function projectsInUse(): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const held = (await navigator.locks?.query())?.held ?? [];
    for (const l of held) if (l.name?.startsWith("m3e:project:")) out.add(l.name.slice("m3e:project:".length));
  } catch {}
  return out;
}

/** the address of a project in this editor, from the address the page is at */
export function projectUrl(id: string, from: { pathname: string; search: string } = location): string {
  const q = new URLSearchParams(from.search);
  q.set(PROJECT_PARAM, id);
  return `${from.pathname}?${q.toString()}`;
}
