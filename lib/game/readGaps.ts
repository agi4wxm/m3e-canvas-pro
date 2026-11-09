/* What a design reads of the game that its gameplay contract does not give (docs/玩法契约.md “缺口”, the plan's J7):
 *
 * - a path of the `world` root (a binding marked per frame, `Item.frame`, or any expression of the design: `world.score`,
 *   `world.byId.slime.hp`, `world.entities[0].x`, `world.clock.now`) that the contract's snapshot schema has no place
 *   for. The root is the snapshot's own keys, with `byId` (the snapshot's entities by id) and `clock` (the world's time)
 *   beside them, as lib/world/root.ts gives it;
 * - a field of `event` that an action on a world view's event (`on:hit`) reads and the event's payload schema does not
 *   carry.
 *
 * A schema that leaves a place open (no `properties`, an `additionalProperties` that is not false, a `$ref` that goes
 * outside the contract) is taken at its word: only what the schema rules out is a gap, never what it does not say.
 * Reads the document, changes nothing; gaps.ts lists these with the rest. */

import { parseExpr, pathsOf } from "../bindings/expr";
import type { GapPlace } from "../export/gaps";
import { groupsInFrame, type Doc, type Group, type Item } from "../tokens";
import type { GameContract } from "./format";

export type ReadGap = { kind: "snapshot" | "payload"; ref: string; reason: "missing"; detail: string; where: GapPlace };

type Schema = boolean | Record<string, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** the part that draws a world (parts/defs/world.ts) */
const WORLD_PART = "world-view";
/** how deep an action's `then`, `catch` and `else` are followed */
const MAX_DEPTH = 8;
/** how many `$ref`, `anyOf` and the like are followed for one step: past it the place is taken as open */
const MAX_SCHEMAS = 64;

/* ---------- the paths an expression reads ---------- */

const NAME = /^[A-Za-z_$][\w$]*$/;

/** A path read from `root` in words the expression language may not read yet (a root it does not know of): each
 *  string skipped whole, `root` met as a name of its own (not `data.world`), then its `.name` and `[0]` / `['key']`. */
const LOOSE = (root: string) => new RegExp(String.raw`'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|(?<![\w$.])${root}((?:\s*\.\s*[A-Za-z_$][\w$]*|\s*\[\s*(?:\d+|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*\])*)`, "g");
const STEP = /\.\s*([A-Za-z_$][\w$]*)|\[\s*(\d+)\s*\]|\[\s*'((?:[^'\\]|\\.)*)'\s*\]|\[\s*"((?:[^"\\]|\\.)*)"\s*\]/g;

/** The paths of `root` an expression reads, each as its steps after the root (`world.byId.slime.hp` → byId, slime,
 *  hp). Read with the expression language where it reads the expression (lib/bindings/expr.ts `pathsOf`), else as
 *  plain words, so a root the language learns later (`world`) is read the same before and after. */
export function rootPathsIn(source: string, root: string): string[][] {
  if (typeof source !== "string" || !source.includes(root)) return [];
  const parsed = parseExpr(source);
  if (parsed.ok) return pathsOf(parsed.expr).filter((p) => p[0] === root).map((p) => p.slice(1));
  const out: string[][] = [];
  for (const m of source.matchAll(LOOSE(root))) {
    if (m[1] === undefined) continue;
    out.push([...m[1].matchAll(STEP)].map((s) => (s[1] ?? s[2] ?? s[3] ?? s[4]).replace(/\\(.)/g, "$1")));
  }
  return out;
}

/** the expressions of words with `{{expression}}` in them */
const templatesIn = (text: string) => (text.includes("{{") ? [...text.matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => m[1].trim()).filter(Boolean) : []);

/* ---------- what a schema has a place for ---------- */

/** the schema a local `$ref` (`#/$defs/entity`) points at in the schema it is part of, or undefined */
function resolve(ref: string, root: Schema): Schema | undefined {
  if (ref === "#") return root;
  if (!ref.startsWith("#/")) return undefined;
  let at: unknown = root;
  for (const raw of ref.slice(2).split("/")) {
    const key = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isRecord(at) || !Object.prototype.hasOwnProperty.call(at, key)) return undefined;
    at = at[key];
  }
  return typeof at === "boolean" || isRecord(at) ? at : undefined;
}

/** the schemas a value is held to at once and in turn: a `$ref` followed, `allOf`, `anyOf` and `oneOf` opened; null when
 *  one of them leaves the place open (a `$ref` that cannot be followed, too many to follow) */
function alternatives(s: Schema, root: Schema, seen = { n: 0 }): Schema[] | null {
  if (++seen.n > MAX_SCHEMAS) return null;
  if (typeof s === "boolean") return [s];
  if (typeof s.$ref === "string") {
    const to = resolve(s.$ref, root);
    if (to === undefined) return null;
    const { $ref: _ref, ...rest } = s;
    const own = Object.keys(rest).length ? alternatives(rest, root, seen) : [];
    const there = alternatives(to, root, seen);
    return own && there ? [...own, ...there] : null;
  }
  const out: Schema[] = [];
  const { allOf, anyOf, oneOf, ...rest } = s;
  for (const list of [allOf, anyOf, oneOf]) {
    if (!Array.isArray(list)) continue;
    for (const x of list) {
      if (typeof x !== "boolean" && !isRecord(x)) continue;
      const got = alternatives(x, root, seen);
      if (!got) return null;
      out.push(...got);
    }
  }
  if (Object.keys(rest).length || !out.length) out.push(rest);
  return out;
}

const typesOf = (s: Record<string, unknown>): string[] => (typeof s.type === "string" ? [s.type] : Array.isArray(s.type) ? s.type.filter((t): t is string => typeof t === "string") : []);

/** What a value the schemas describe holds at `step`: the schemas of it there, [] when none has a place for it, null
 *  when one leaves it open (and so whatever is read beyond is no gap). */
function stepInto(schemas: Schema[], step: string, root: Schema): Schema[] | null {
  const out: Schema[] = [];
  for (const s0 of schemas) {
    const alts = alternatives(s0, root);
    if (!alts) return null;
    for (const s of alts) {
      if (s === false) continue;
      if (s === true) return null;
      const types = typesOf(s);
      const props = isRecord(s.properties) ? s.properties : undefined;
      const objectLike = types.includes("object") || props !== undefined || s.additionalProperties !== undefined || s.patternProperties !== undefined;
      const arrayLike = types.includes("array") || s.items !== undefined || s.prefixItems !== undefined;
      /* a schema that says nothing of the value's shape leaves every place open */
      if (!types.length && !objectLike && !arrayLike) return null;
      if (objectLike) {
        if (props && Object.prototype.hasOwnProperty.call(props, step)) {
          const p = props[step];
          if (typeof p === "boolean" || isRecord(p)) out.push(p);
          continue;
        }
        if (s.patternProperties !== undefined) return null;
        const extra = s.additionalProperties;
        if (extra === undefined || extra === true) return null;
        if (isRecord(extra)) out.push(extra);
        continue;
      }
      if (arrayLike) {
        if (step === "length") out.push({ type: "integer" });
        else if (/^\d+$/.test(step)) {
          const tuple = Array.isArray(s.prefixItems) ? s.prefixItems[Number(step)] : undefined;
          const item = tuple ?? s.items;
          if (item === undefined || item === true) return null;
          if (typeof item === "boolean" || isRecord(item)) out.push(item);
        }
        continue;
      }
      if (types.includes("string") && step === "length") out.push({ type: "integer" });
    }
  }
  return out;
}

/** the names a schema's place has (its `properties`), to say what there is instead */
function namesAt(schemas: Schema[], root: Schema): string[] {
  const out = new Set<string>();
  for (const s0 of schemas) for (const s of alternatives(s0, root) ?? []) if (isRecord(s) && isRecord(s.properties)) for (const k of Object.keys(s.properties)) out.add(k);
  return [...out];
}

/** How far a path goes in a schema: the number of its steps that have a place, the whole path when it is in, or every
 *  step past one the schema leaves open; with the names the place it stops at has. */
export function schemaReach(schema: Schema, path: readonly string[], root: Schema = schema): { reach: number; names: string[] } {
  let at: Schema[] = [schema];
  for (let i = 0; i < path.length; i++) {
    const next = stepInto(at, path[i], root);
    if (next === null) return { reach: path.length, names: [] };
    if (!next.length) return { reach: i, names: namesAt(at, root) };
    at = next;
  }
  return { reach: path.length, names: [] };
}

/** The schema of the `world` root for a contract's snapshot, as lib/world/root.ts builds it: the snapshot's own keys,
 *  `byId` (each entity as the snapshot's `entities` items say) and `clock`. A snapshot that is a `$ref` is followed
 *  first. */
export function worldRootSchemaOf(snapshot: Schema): Schema {
  const alts = alternatives(snapshot, snapshot);
  /* a snapshot that is no plain object of properties (a union, open) leaves the root open beside byId and clock */
  const plain = alts && alts.length === 1 && isRecord(alts[0]) && isRecord(alts[0].properties) ? alts[0] : null;
  const own = plain ? (plain.properties as Record<string, unknown>) : {};
  const entities = own.entities;
  const entity = isRecord(entities) && (entities.items !== undefined) ? entities.items : {};
  return {
    type: "object",
    properties: {
      ...own,
      byId: { type: "object", additionalProperties: entity },
      clock: { type: "object", properties: { now: { type: "number" }, paused: { type: "boolean" }, rate: { type: "number" } }, additionalProperties: false },
    },
    additionalProperties: plain && plain.additionalProperties === false ? false : true,
  };
}

/* ---------- where a design reads them ---------- */

/** the expressions an action body reads itself and in its answers: conditions, a variable set from one, a snackbar's
 *  words, a call's or a move's arguments */
function actionExprs(a: unknown, out: string[], depth = 0): string[] {
  if (!isRecord(a) || depth > MAX_DEPTH) return out;
  if (isRecord(a.when) && typeof a.when.expr === "string") out.push(a.when.expr);
  for (const b of [a, a.else]) {
    if (!isRecord(b) || !Array.isArray(b.effects)) continue;
    for (const e of b.effects) {
      if (!isRecord(e)) continue;
      for (const k of ["expr", "vector", "body"]) if (typeof e[k] === "string") out.push(e[k] as string);
      if (typeof e.message === "string") out.push(...templatesIn(e.message));
      if (isRecord(e.args)) for (const v of Object.values(e.args)) if (typeof v === "string") out.push(v);
      if (isRecord(e.when) && typeof e.when.expr === "string") out.push(e.when.expr);
      actionExprs(e.then, out, depth + 1);
      actionExprs(e.catch, out, depth + 1);
    }
  }
  return out;
}

/** what an item reads, by the slot it reads it in: its per-frame bindings, its bindings to an expression, the
 *  `{{…}}` in its words, its actions */
function itemReads(it: Item): { prop: string; exprs: string[]; event?: string }[] {
  const out: { prop: string; exprs: string[]; event?: string }[] = [];
  /* `Item.frame` (lib/bindings/frame.ts): the per-frame bindings, read straight off the world, no "=" before */
  const frame = (it as Item & { frame?: unknown }).frame;
  if (isRecord(frame)) for (const [k, v] of Object.entries(frame)) if (typeof v === "string") out.push({ prop: `frame ${k}`, exprs: [v] });
  for (const [k, v] of Object.entries(it.bind ?? {})) if (typeof v === "string" && v.startsWith("=")) out.push({ prop: `bind ${k}`, exprs: [v.slice(1)] });
  for (const [k, v] of Object.entries(it.props ?? {})) if (typeof v === "string") {
    const t = templatesIn(v);
    if (t.length) out.push({ prop: k, exprs: t });
  }
  if (it.action) out.push({ prop: "action", exprs: actionExprs(it.action, []) });
  for (const [key, a] of Object.entries(it.actions ?? {})) out.push({ prop: key, exprs: actionExprs(a, []), ...(key.startsWith("on:") && it.component === WORLD_PART ? { event: key.slice(3) } : {}) });
  return out;
}

const pathText = (root: string, steps: readonly string[]) => [root, ...steps].reduce((s, x) => (s === "" ? x : NAME.test(x) ? `${s}.${x}` : /^\d+$/.test(x) ? `${s}[${x}]` : `${s}[${JSON.stringify(x)}]`), "");

/** Every path of the world's snapshot and of an event's payload the design reads that the contract has no place for.
 *  None without a contract. */
export function readGaps(doc: Pick<Doc, "groups" | "frames" | "components"> & { game?: { contract: GameContract } }, widths: Record<string, number> = {}): ReadGap[] {
  const c = doc.game?.contract;
  if (!c) return [];
  const world = worldRootSchemaOf(c.snapshot as Schema);
  const gaps: ReadGap[] = [];
  const seen = new Set<string>();
  const push = (g: ReadGap) => {
    const k = `${g.kind}|${g.ref}|${JSON.stringify(g.where)}`;
    if (seen.has(k)) return;
    seen.add(k);
    gaps.push(g);
  };
  const visit = (groups: Group[], place: (g: Group) => GapPlace) => {
    for (const g of groups) {
      const at = place(g);
      const when: unknown = g.showWhen;
      if (isRecord(when) && typeof when.expr === "string") for (const p of rootPathsIn(when.expr, "world")) check(p, { ...at, part: g.name || g.id, prop: "showWhen" });
      for (const it of g.items)
        for (const r of itemReads(it)) {
          const where = { ...at, part: it.label || it.id, prop: r.prop };
          for (const e of r.exprs) {
            for (const p of rootPathsIn(e, "world")) check(p, where);
            const payload = r.event !== undefined && Object.prototype.hasOwnProperty.call(c.events, r.event) ? c.events[r.event].payload : undefined;
            if (payload !== undefined) for (const p of rootPathsIn(e, "event")) {
              const { reach, names } = schemaReach(payload as Schema, p);
              if (reach < p.length) push({ kind: "payload", ref: `event ${r.event}.${pathText("", p.slice(0, reach + 1))}`, reason: "missing", where, detail: `reads ${pathText("event", p.slice(0, reach + 1))} on ${r.event}, which its payload does not carry${names.length ? ` (it carries ${names.join(", ")})` : ""}` });
            }
          }
        }
    }
  };
  function check(p: string[], where: GapPlace) {
    const { reach, names } = schemaReach(world, p);
    if (reach >= p.length) return;
    const ref = pathText("world", p.slice(0, reach + 1));
    push({ kind: "snapshot", ref, reason: "missing", where, detail: `reads ${ref}, which the game's snapshot has no place for${names.length ? ` (${reach ? `${pathText("world", p.slice(0, reach))} has` : "it has"} ${names.join(", ")})` : ""}` });
  }
  const screenOf = new Map<string, string>();
  for (const f of doc.frames) for (const g of groupsInFrame(doc.groups, f, doc.frames, widths)) if (!screenOf.has(g.id)) screenOf.set(g.id, f.name);
  visit(doc.groups, (g) => (screenOf.has(g.id) ? { screen: screenOf.get(g.id) } : {}));
  for (const d of doc.components ?? []) visit(d.groups, () => ({ component: d.name }));
  return gaps;
}
