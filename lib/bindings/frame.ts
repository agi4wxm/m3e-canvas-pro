/* Bindings marked per frame (docs/数据绑定.md “每帧绑定”, the plan's K3): a HUD's health bars, damage numbers and
 * cooldowns change every frame, so they are not drawn through the app's state as the other bindings are (a data
 * source answering, React drawing again). A part's prop is bound per frame in `Item.frame` (`{text: "world.score"}`):
 * the expression reads the `world` root only (lib/world/root.ts: the world's snapshot, its entities by id, its clock),
 * and each host evaluates it on every frame and writes what it comes to straight into what it drew (the preview and the
 * web app a DOM node, the phone app an animated value, the mini-program its page's node), never through a render.
 *
 * Such an expression is held to cheap reads and arithmetic, here and only here: no helper's call (a call is the one
 * thing whose cost has no small bound, and the place a rule could hide), no root but `world` (no data source, no
 * variable, no form: what a frame reads is the world's snapshot, which the world alone writes), no side effect (the
 * language has none), and a bound on its size. So a HUD can only show the world; it cannot settle any of its play
 * (docs/边界与契约.md: what is hit, what it costs, who won are the world's to say). Plain TypeScript, copied into an
 * exported app's runtime with the evaluator. */

import { EXPR_LIMITS, parseExpr, rootsOf, type Expr } from "./expr";

/** the bounds of an expression evaluated on every frame, well inside any expression's (expr.ts `EXPR_LIMITS`) */
export const FRAME_LIMITS = {
  /** characters in one */
  length: 400,
  /** nodes of its tree: reads, literals, operators */
  nodes: 48,
  /** how deep its tree may nest */
  depth: 16,
  /** per-frame bindings on one screen (with the screens laid over it): what one frame evaluates at most */
  perScreen: 400,
};

/** the only root a per-frame expression reads */
export const FRAME_ROOT = "world";

/** a prop bound per frame, as a host's frame loop takes it: the part (its id, or the key a printed app knows it by), the
 *  prop, the expression */
export type FrameBinding = { part: string; prop: string; expr: string };

function measure(e: Expr): { nodes: number; depth: number; calls: number } {
  let nodes = 0;
  let calls = 0;
  let depth = 0;
  const stack: [Expr, number][] = [[e, 1]];
  while (stack.length) {
    const [x, d] = stack.pop()!;
    nodes++;
    depth = Math.max(depth, d);
    switch (x.k) {
      case "get":
        stack.push([x.obj, d + 1], [x.key, d + 1]);
        break;
      case "call":
        calls++;
        for (const a of x.args) stack.push([a, d + 1]);
        break;
      case "un":
        stack.push([x.x, d + 1]);
        break;
      case "bin":
        stack.push([x.a, d + 1], [x.b, d + 1]);
        break;
      case "cond":
        stack.push([x.test, d + 1], [x.yes, d + 1], [x.no, d + 1]);
        break;
    }
  }
  return { nodes, depth, calls };
}

/** Why a value is not an expression a prop may be bound to per frame, or null when it is one: it parses, reads `world`
 *  and nothing else, calls no helper, and stays inside `FRAME_LIMITS`. The one check every reader of `Item.frame` uses:
 *  the operations, reading a file, the panel, and every host's frame loop before it evaluates anything. */
export function frameExprError(v: unknown): string | null {
  if (typeof v !== "string") return "a per-frame expression should be text";
  if (!v.trim()) return "the per-frame expression is empty";
  if (v.length > Math.min(FRAME_LIMITS.length, EXPR_LIMITS.length)) return `a per-frame expression is at most ${FRAME_LIMITS.length} characters`;
  const p = parseExpr(v);
  if (!p.ok) return `${JSON.stringify(v.length > 80 ? `${v.slice(0, 80)}…` : v)} is no expression: ${p.error} (at character ${p.at})`;
  const other = rootsOf(p.expr).filter((r) => r !== FRAME_ROOT);
  if (other.length) return `a per-frame expression reads only world (the world's snapshot, world.byId, world.clock), not ${other.join(", ")}: bind it without frame for anything else`;
  const m = measure(p.expr);
  if (m.calls) return "a per-frame expression calls no helper: only reads of world, literals and arithmetic (+ - * / %, comparisons, && || ! ?? and ? :)";
  if (m.nodes > FRAME_LIMITS.nodes) return `a per-frame expression has at most ${FRAME_LIMITS.nodes} steps (reads, literals, operators); this one has ${m.nodes}`;
  if (m.depth > FRAME_LIMITS.depth) return `a per-frame expression nests at most ${FRAME_LIMITS.depth} deep`;
  return null;
}

/** the tree of a per-frame expression, read once, or null when it breaks the rule (it is then never evaluated) */
export function compileFrame(v: unknown): Expr | null {
  if (frameExprError(v) !== null) return null;
  const p = parseExpr(v as string);
  return p.ok ? p.expr : null;
}

/** whether an expression reads the `world` root: what only a per-frame binding may */
export function readsWorld(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const p = parseExpr(v);
  return p.ok && rootsOf(p.expr).includes(FRAME_ROOT);
}
