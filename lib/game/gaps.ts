/* What in a design no longer matches its gameplay contract (docs/玩法契约.md, “缺口”): a call to a command the contract
 * does not have (or to a fact, which only another system sends), an argument it does not take or a parameter it
 * needs and is not given, a `catch` that branches on a refusal the command no longer has, an input action the world
 * does not take, a world view's action on an event it does not send. Importing a changed contract lists these; the
 * export's gap report (the plan's J7, `.m3e/gaps.json`) is to read the same list. Reads the document, changes nothing. */

import type { Action, ActionBody, Doc, Effect, Group, Item } from "../tokens";
import { apiCommands, inputCommands, type GameContract } from "./format";
import { gameOperationId, refusalsOf, rejectionType } from "./map";

export type GameGapKind = "command" | "fact" | "param" | "rejection" | "input" | "event";

/** One reference of the design's that the contract does not answer: what kind, what it names (`game.pull`,
 *  `game.pull count`, `urn:game:problem:cooldown`, `input jump`, `event dodged`), where it is (a screen's or a
 *  component's part and its slot), and a sentence saying so. */
export type GameGap = { kind: GameGapKind; ref: string; where: string; detail: string };

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

function bodyGaps(b: ActionBody | undefined, where: string, ctx: Ctx, depth: number): void {
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

function answerGaps(a: (ActionBody & { when?: unknown; else?: ActionBody }) | undefined, where: string, ctx: Ctx, depth: number, refusals?: Set<string>): void {
  if (!isRecord(a)) return;
  /* a catch of a command's: what it compares error.type with is a refusal of that command, when it is one of the contract's */
  if (refusals)
    for (const s of exprsOf(a).flatMap(quoted))
      if ((s.startsWith(ctx.base) || ctx.types.has(s)) && !refusals.has(s)) ctx.gaps.push({ kind: "rejection", ref: s, where, detail: `branches on the refusal ${s}, which the command no longer answers with` });
  bodyGaps(a, where, ctx, depth + 1);
  if (isRecord(a.else)) bodyGaps(a.else, where, ctx, depth + 1);
}

function effectGaps(e: Effect, where: string, ctx: Ctx, depth: number): void {
  const { c } = ctx;
  if (e.do === "call" && typeof e.operationId === "string" && e.operationId.startsWith(`${c.namespace}.`)) {
    const name = e.operationId.slice(c.namespace.length + 1);
    const cmd = c.commands[name];
    if (c.facts?.[name]) ctx.gaps.push({ kind: "fact", ref: e.operationId, where, detail: `calls ${e.operationId}, a fact the game loop takes from ${c.facts[name].from}, never from the app` });
    else if (!cmd || cmd.via !== "api") ctx.gaps.push({ kind: "command", ref: e.operationId, where, detail: cmd ? `calls ${e.operationId}, which the game takes as an input action (move, press, release), not a call` : `calls ${e.operationId}, a command the contract does not have` });
    else {
      const props = isRecord(cmd.params?.properties) ? Object.keys(cmd.params!.properties as object) : [];
      const given = Object.keys(isRecord(e.args) ? e.args : {});
      if (e.body === undefined) {
        for (const k of given) if (!props.includes(k)) ctx.gaps.push({ kind: "param", ref: `${e.operationId} ${k}`, where, detail: `gives ${e.operationId} ${k}, which it does not take${props.length ? ` (it takes ${props.join(", ")})` : ""}` });
        for (const k of Array.isArray(cmd.params?.required) ? (cmd.params!.required as string[]) : []) if (!given.includes(k)) ctx.gaps.push({ kind: "param", ref: `${e.operationId} ${k}`, where, detail: `does not give ${e.operationId} ${k}, which it needs` });
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
    if (!type) ctx.gaps.push({ kind: "input", ref: `input ${action}`, where, detail: `sends ${action} to the world, which takes ${[...inputs].map(([n, t]) => `${n}: ${t}`).join(", ")}` });
    else if (type !== wants) ctx.gaps.push({ kind: "input", ref: `input ${action}`, where, detail: `${e.do === "move" ? "moves" : e.do === "press" ? "presses" : "lets go of"} ${action}, which the world takes as a ${type}` });
  }
}

function actionGaps(a: Action | undefined, where: string, ctx: Ctx): void {
  if (!isRecord(a)) return;
  bodyGaps(a, where, ctx, 0);
  if (isRecord(a.else)) bodyGaps(a.else, where, ctx, 0);
}

function groupsGaps(groups: Group[], place: (g: Group) => string, ctx: Ctx): void {
  for (const g of groups) {
    const at = place(g);
    for (const it of g.items) {
      const where = `${at} part ${it.id}`;
      actionGaps(it.action, where, ctx);
      for (const [key, a] of Object.entries(it.actions ?? {})) {
        actionGaps(a, `${where} ${key}`, ctx);
        const event = key.startsWith("on:") ? key.slice(3) : null;
        if (event && it.component === WORLD_PART && Object.keys(ctx.c.events).length && !ctx.c.events[event]) ctx.gaps.push({ kind: "event", ref: `event ${event}`, where: `${where} ${key}`, detail: `acts on the world's ${event}, an event the contract does not have` });
      }
    }
    if (g.form) {
      const op = g.form.operationId;
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      if (typeof op === "string" && op.startsWith(`${ctx.c.namespace}.`)) effectGaps({ do: "call", operationId: op, body: "form", then: g.form.then, catch: g.form.catch } as Effect, `${at} form ${g.id}`, ctx, 0);
      else {
        bodyGaps(g.form.then, `${at} form ${g.id}`, ctx, 1);
        bodyGaps(g.form.catch, `${at} form ${g.id}`, ctx, 1);
      }
    }
  }
}

/** Everything in the document that names its gameplay contract and is not in it; none without a contract. */
export function gameGaps(doc: Pick<Doc, "groups" | "frames" | "components"> & { game?: { contract: GameContract } }): GameGap[] {
  const c = doc.game?.contract;
  if (!c) return [];
  const base = rejectionType(c, "");
  const types = new Set(apiCommands(c).flatMap(([name, cmd]) => refusalsOf(c, name, cmd).map((r) => r.type)));
  const items = new Map<string, Item>();
  for (const g of [...doc.groups, ...(doc.components ?? []).flatMap((d) => d.groups)]) for (const it of g.items) items.set(it.id, it);
  const ctx: Ctx = { c, gaps: [], items, types, base };
  /* a group's screen: the one whose left edge it is past and nearest to (the canvas lays screens out in a row) */
  const frames = [...doc.frames].sort((a, b) => a.x - b.x);
  const screenOf = (g: Group) => {
    const f = [...frames].reverse().find((x) => g.x >= x.x) ?? frames[0];
    return f ? `screen ${f.id}` : "canvas";
  };
  groupsGaps(doc.groups, screenOf, ctx);
  for (const d of doc.components ?? []) groupsGaps(d.groups, () => `component ${d.id}`, ctx);
  for (const f of doc.frames)
    for (const s of f.data ?? []) {
      if (typeof s.operationId !== "string" || !s.operationId.startsWith(`${c.namespace}.`)) continue;
      const name = s.operationId.slice(c.namespace.length + 1);
      if (c.commands[name]?.via !== "api") ctx.gaps.push({ kind: c.facts?.[name] ? "fact" : "command", ref: s.operationId, where: `screen ${f.id} data ${s.name}`, detail: c.facts?.[name] ? `loads ${s.operationId}, a fact the game loop takes from ${c.facts[name].from}, never from the app` : `loads ${s.operationId}, a command the contract does not have` });
    }
  /* one line for each reference: the same one met twice (a family's slot and an action under it) is said once */
  const seen = new Set<string>();
  return ctx.gaps.filter((g) => {
    const k = `${g.kind}|${g.ref}|${g.where}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

export { gameOperationId };
