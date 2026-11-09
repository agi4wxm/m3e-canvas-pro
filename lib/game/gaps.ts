/* What in a design no longer matches its gameplay contract (docs/玩法契约.md, “缺口”): a call to a command the contract
 * does not have (or to a fact, which only another system sends), an argument it does not take or a parameter it
 * needs and is not given, a `catch` that branches on a refusal the command no longer has, an input action the world
 * does not take, a world view's action on an event it does not send. Importing a changed contract lists these, and
 * `gameHubGaps` gives them in the gap file's format (lib/export/gaps.ts, `.m3e/gaps.json`), module `game-loop`, for the
 * export's gap report to take in (the plan's J7). Reads the document, changes nothing. */

import type { Gap, GapPlace } from "../export/gaps";
import { groupsInFrame, type Action, type ActionBody, type Doc, type Effect, type Group, type Item } from "../tokens";
import { apiCommands, inputCommands, type GameContract } from "./format";
import { gameOperationId, refusalsOf, rejectionType } from "./map";

export type GameGapKind = "command" | "fact" | "param" | "rejection" | "input" | "event";

/** One reference of the design's that the contract does not answer: what kind, what it names (`game.pull`,
 *  `game.pull count`, `urn:game:problem:cooldown`, `input jump`, `event dodged`), why in a word (`missing`, `not-a-call`,
 *  `not-the-apps`, `not-taken`, `needed`, `wrong-type`), and in a sentence, and where it is: the screen (by name) or
 *  the component, the part and the slot or the form or the data source (`prop`), as the gap file places them. */
export type GameGap = { kind: GameGapKind; ref: string; reason: string; detail: string; where: GapPlace };

/** a gap's place in words: `screen Summon, part pull-1, action` */
export const gapWhere = (p: GapPlace) => [p.screen !== undefined ? `screen ${p.screen}` : "", p.component !== undefined ? `component ${p.component}` : "", p.part ? `part ${p.part}` : "", p.prop ?? ""].filter(Boolean).join(", ");

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** the part that draws a world (parts/defs/world.ts): its events and inputs are the world's */
const WORLD_PART = "world-view";
/** how deep `then`, `catch` and `else` are followed: past what any document may hold */
const MAX_DEPTH = 8;

/** the strings an expression quotes: what a condition on `error.type` compares it with */
function quoted(expr: string): string[] {
  const out: string[] = [];
  for (const m of expr.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) out.push((m[1] ?? m[2]).replace(/\\(.)/g, "$1"));
  return out;
}

type Ctx = { c: GameContract; gaps: GameGap[]; items: Map<string, Item>; types: Set<string>; base: string };

function bodyGaps(b: ActionBody | undefined, where: GapPlace, ctx: Ctx, depth: number): void {
  if (!isRecord(b) || !Array.isArray(b.effects) || depth > MAX_DEPTH) return;
  for (const e of b.effects) if (isRecord(e)) effectGaps(e as Effect, where, ctx, depth);
}

/** the expressions a body reads itself (its condition, a variable set from one, a snackbar's words, a call's or a move's
 *  arguments), not those of the calls it makes, which answer to their own commands */
function exprsOf(a: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (isRecord(a.when) && typeof a.when.expr === "string") out.push(a.when.expr);
  for (const b of [a, isRecord(a.else) ? a.else : undefined])
    for (const e of Array.isArray(b?.effects) ? b.effects : [])
      if (isRecord(e)) for (const k of ["expr", "message", "vector", "body"]) if (typeof e[k] === "string") out.push(e[k] as string);
  for (const b of [a, isRecord(a.else) ? a.else : undefined]) for (const e of Array.isArray(b?.effects) ? b.effects : []) if (isRecord(e) && isRecord(e.args)) for (const v of Object.values(e.args)) if (typeof v === "string") out.push(v);
  return out;
}

function answerGaps(a: (ActionBody & { when?: unknown; else?: ActionBody }) | undefined, where: GapPlace, ctx: Ctx, depth: number, refusals?: Set<string>): void {
  if (!isRecord(a)) return;
  /* a catch of a command's: what it compares error.type with is a refusal of that command, when it is one of the contract's */
  if (refusals)
    for (const s of exprsOf(a).flatMap(quoted))
      if ((s.startsWith(ctx.base) || ctx.types.has(s)) && !refusals.has(s)) ctx.gaps.push({ kind: "rejection", ref: s, reason: "missing", where, detail: `branches on the refusal ${s}, which the command no longer answers with` });
  bodyGaps(a, where, ctx, depth + 1);
  if (isRecord(a.else)) bodyGaps(a.else, where, ctx, depth + 1);
}

function effectGaps(e: Effect, where: GapPlace, ctx: Ctx, depth: number): void {
  const { c } = ctx;
  if (e.do === "call" && typeof e.operationId === "string" && e.operationId.startsWith(`${c.namespace}.`)) {
    const name = e.operationId.slice(c.namespace.length + 1);
    const cmd = c.commands[name];
    if (c.facts?.[name]) ctx.gaps.push({ kind: "fact", ref: e.operationId, reason: "not-the-apps", where, detail: `calls ${e.operationId}, a fact the game loop takes from ${c.facts[name].from}, never from the app` });
    else if (!cmd || cmd.via !== "api") ctx.gaps.push({ kind: "command", ref: e.operationId, reason: cmd ? "not-a-call" : "missing", where, detail: cmd ? `calls ${e.operationId}, which the game takes as an input action (move, press, release), not a call` : `calls ${e.operationId}, a command the contract does not have` });
    else {
      const props = isRecord(cmd.params?.properties) ? Object.keys(cmd.params!.properties as object) : [];
      const given = Object.keys(isRecord(e.args) ? e.args : {});
      if (e.body === undefined) {
        for (const k of given) if (!props.includes(k)) ctx.gaps.push({ kind: "param", ref: `${e.operationId} ${k}`, reason: "not-taken", where, detail: `gives ${e.operationId} ${k}, which it does not take${props.length ? ` (it takes ${props.join(", ")})` : ""}` });
        for (const k of Array.isArray(cmd.params?.required) ? (cmd.params!.required as string[]) : []) if (!given.includes(k)) ctx.gaps.push({ kind: "param", ref: `${e.operationId} ${k}`, reason: "needed", where, detail: `does not give ${e.operationId} ${k}, which it needs` });
      }
      const refusals = new Set(refusalsOf(c, name, cmd).map((r) => r.type));
      answerGaps(e.then as never, where, ctx, depth);
      answerGaps(e.catch as never, where, ctx, depth, refusals);
      return;
    }
  }
  if (e.do === "call" || e.do === "invoke") {
    answerGaps(e.then as never, where, ctx, depth);
    answerGaps(e.catch as never, where, ctx, depth);
    return;
  }
  if ((e.do === "move" || e.do === "press" || e.do === "release") && ctx.items.get(e.part)?.component === WORLD_PART) {
    const inputs = new Map(inputCommands(c).map(([n, cmd]) => [n, cmd.input]));
    if (!inputs.size) return;
    const action = e.do === "move" ? (e.action ?? "move") : e.action;
    const type = inputs.get(action);
    const wants = e.do === "move" ? "vec2" : "bool";
    if (!type) ctx.gaps.push({ kind: "input", ref: `input ${action}`, reason: "missing", where, detail: `sends ${action} to the world, which takes ${[...inputs].map(([n, t]) => `${n}: ${t}`).join(", ")}` });
    else if (type !== wants) ctx.gaps.push({ kind: "input", ref: `input ${action}`, reason: "wrong-type", where, detail: `${e.do === "move" ? "moves" : e.do === "press" ? "presses" : "lets go of"} ${action}, which the world takes as a ${type}` });
  }
}

function actionGaps(a: Action | undefined, where: GapPlace, ctx: Ctx): void {
  if (!isRecord(a)) return;
  bodyGaps(a, where, ctx, 0);
  if (isRecord(a.else)) bodyGaps(a.else, where, ctx, 0);
}

function groupsGaps(groups: Group[], place: (g: Group) => GapPlace, ctx: Ctx): void {
  for (const g of groups) {
    const at = place(g);
    for (const it of g.items) {
      const here = { ...at, part: it.label || it.id };
      actionGaps(it.action, { ...here, prop: "action" }, ctx);
      for (const [key, a] of Object.entries(it.actions ?? {})) {
        actionGaps(a, { ...here, prop: key }, ctx);
        const event = key.startsWith("on:") ? key.slice(3) : null;
        if (event && it.component === WORLD_PART && Object.keys(ctx.c.events).length && !ctx.c.events[event]) ctx.gaps.push({ kind: "event", ref: `event ${event}`, reason: "missing", where: { ...here, prop: key }, detail: `acts on the world's ${event}, an event the contract does not have` });
      }
    }
    if (g.form) {
      const op = g.form.operationId;
      const here = { ...at, part: g.name || g.id, prop: "form" };
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      if (typeof op === "string" && op.startsWith(`${ctx.c.namespace}.`)) effectGaps({ do: "call", operationId: op, body: "form", then: g.form.then, catch: g.form.catch } as Effect, here, ctx, 0);
      else {
        bodyGaps(g.form.then, here, ctx, 1);
        bodyGaps(g.form.catch, here, ctx, 1);
      }
    }
  }
}

/** Everything in the document that names its gameplay contract and is not in it; none without a contract. */
export function gameGaps(doc: Pick<Doc, "groups" | "frames" | "components"> & { game?: { contract: GameContract } }, widths: Record<string, number> = {}): GameGap[] {
  const c = doc.game?.contract;
  if (!c) return [];
  const base = rejectionType(c, "");
  const types = new Set(apiCommands(c).flatMap(([name, cmd]) => refusalsOf(c, name, cmd).map((r) => r.type)));
  const items = new Map<string, Item>();
  for (const g of [...doc.groups, ...(doc.components ?? []).flatMap((d) => d.groups)]) for (const it of g.items) items.set(it.id, it);
  const ctx: Ctx = { c, gaps: [], items, types, base };
  /* each group on the screen it stands on (lib/tokens.ts groupsInFrame), the rest off every screen */
  const screenOf = new Map<string, string>();
  for (const f of doc.frames) for (const g of groupsInFrame(doc.groups, f, doc.frames, widths)) if (!screenOf.has(g.id)) screenOf.set(g.id, f.name);
  groupsGaps(doc.groups, (g) => (screenOf.has(g.id) ? { screen: screenOf.get(g.id) } : {}), ctx);
  for (const d of doc.components ?? []) groupsGaps(d.groups, () => ({ component: d.name }), ctx);
  for (const f of doc.frames)
    for (const s of f.data ?? []) {
      if (typeof s.operationId !== "string" || !s.operationId.startsWith(`${c.namespace}.`)) continue;
      const name = s.operationId.slice(c.namespace.length + 1);
      const fact = c.facts?.[name];
      if (c.commands[name]?.via !== "api") ctx.gaps.push({ kind: fact ? "fact" : "command", ref: s.operationId, reason: fact ? "not-the-apps" : c.commands[name] ? "not-a-call" : "missing", where: { screen: f.name, prop: `data ${s.name}` }, detail: fact ? `loads ${s.operationId}, a fact the game loop takes from ${fact.from}, never from the app` : `loads ${s.operationId}, a command the contract does not have as a call` });
    }
  /* one line for each reference: the same one met twice (a family's slot and an action under it) is said once */
  const seen = new Set<string>();
  return ctx.gaps.filter((g) => {
    const k = `${g.kind}|${g.ref}|${JSON.stringify(g.where)}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

/** The gaps as the gap file has them (lib/export/gaps.ts): one per thing missing, module `game-loop`, with every place
 *  the design leans on it. */
export function gameHubGaps(doc: Parameters<typeof gameGaps>[0], widths: Record<string, number> = {}): Gap[] {
  const out = new Map<string, Gap>();
  for (const g of gameGaps(doc, widths)) {
    const key = `${g.kind}\n${g.ref}\n${g.reason}`;
    const gap = out.get(key) ?? { kind: `game-${g.kind}`, module: "game-loop", ref: g.ref, reason: g.reason, detail: g.detail, where: [] };
    gap.where.push(g.where);
    out.set(key, gap);
  }
  return [...out.values()];
}

export { gameOperationId };
