/* What the whole document says that the printing of each of its screens needs to know: which parts a tap shows, hides,
 * opens or sets a prop of (they are drawn while the app's memory says so), which inputs a condition asks whether they
 * are filled, which screens open over another and which a navigation bar's destinations are. One walk over every
 * action body of the document, the phone app's and the mini-program's alike (docs/交互规则.md: a tap's else, the then
 * and catch of its calls and invokes, and the branch an answer picks, are actions too). */

import { BACK_TARGET, type Action, type ActionBody, type Condition, type Doc, type Frame, type Group, type Item } from "../../tokens";
import { cleanMotion } from "../../prototype";
import { partNames } from "../bindCode";

/** the parts navigation bars stand for: their destinations are an app's tabs */
export const NAV_BARS = new Set(["navigation-bar", "tab-bar", "floating-nav", "navigation-rail"]);

/** an action body as the walk meets it: a tap's, its else, a call's then or catch (with the branch it picks) */
type Body = ActionBody & { when?: Condition; else?: ActionBody };

/** Every action body the document holds: each part's taps, their else, the then and catch of their calls and invokes
 *  (and the else of an answer's condition), and a form's then and catch; `item` is the part a tap is on. */
export function eachBody(doc: Pick<Doc, "groups">, fn: (b: Body, item?: Item) => void) {
  const visit = (b: Body | undefined, item?: Item, depth = 0) => {
    if (!b || depth > 6) return;
    fn(b, item);
    visit(b.else, item, depth + 1);
    for (const e of b.effects ?? []) {
      if (e.do !== "call" && e.do !== "invoke") continue;
      visit(e.then, item, depth + 1);
      visit(e.catch, item, depth + 1);
    }
  };
  for (const g of doc.groups) {
    for (const it of g.items) {
      visit(it.action, it);
      for (const a of Object.values(it.actions ?? {})) visit(a, it);
    }
    visit(g.form?.then);
    visit(g.form?.catch);
  }
}

export type DocFacts = {
  /** the group that holds each part */
  owner: Map<string, Group>;
  /** the id of the group that holds each part */
  groupOf: Map<string, string>;
  /** the groups a tap shows or hides (or opens or closes), and those hidden at the start */
  toggled: Set<string>;
  hidden: Set<string>;
  /** the groups a tap opens or closes */
  opened: Set<string>;
  /** the inputs a condition asks whether they are filled */
  filled: Set<string>;
  /** the props taps set, by part */
  setProps: Map<string, Set<string>>;
  /** the screens a tap opens over another: those it lays over (`overlay`), and those marked as a layer it opens */
  overlays: Set<string>;
  /** the screens marked as a layer laid over the screen on show (a HUD, a dialog, a toast: docs/交互规则.md “分层”) */
  laid: Set<string>;
  /** the screens a navigation bar's destinations are */
  tabs: Set<string>;
  /** what a warning and the printed code call a part: a name made of its words (`bindCode.partNames`), not its id */
  names: Map<string, string>;
};

/** the screens marked as a layer laid over the screen on show when opened (lib/world/layers.ts `laidAs`) */
export const laidScreens = (frames: readonly Pick<Frame, "id" | "layer">[] | undefined) => new Set((frames ?? []).filter((f) => f.layer === "hud" || f.layer === "dialog" || f.layer === "toast").map((f) => f.id));

/** Whether a tap's move lays its screen over the one on show: the action says so (`overlay`), or the screen is a layer.
 *  A phone's and a mini-program's navigators lay it over the way they lay an overlay. */
export const laysOver = (laid: Pick<ReadonlySet<string>, "has">, b: Pick<ActionBody, "to" | "overlay">) => b.overlay === true || (!!b.to && laid.has(b.to));

export function factsOf(doc: Pick<Doc, "groups"> & Partial<Pick<Doc, "frames">>): DocFacts {
  const owner = new Map<string, Group>();
  const groupOf = new Map<string, string>();
  for (const g of doc.groups)
    for (const it of g.items) {
      owner.set(it.id, g);
      groupOf.set(it.id, g.id);
    }
  const facts: DocFacts = { owner, groupOf, toggled: new Set(), hidden: new Set(doc.groups.filter((g) => g.hidden).map((g) => g.id)), opened: new Set(), filled: new Set(), setProps: new Map(), overlays: new Set(), laid: laidScreens(doc.frames), tabs: new Set(), names: partNames(doc) };
  const conditions = (c: Condition | undefined) => {
    if (c && "filled" in c && typeof c.filled === "string") facts.filled.add(c.filled);
  };
  for (const g of doc.groups) conditions(g.showWhen);
  eachBody(doc, (b, item) => {
    conditions(b.when);
    if (b.to && laysOver(facts.laid, b)) facts.overlays.add(b.to);
    for (const e of b.effects ?? []) {
      if (e.do === "show" || e.do === "hide" || e.do === "toggle" || e.do === "open" || e.do === "close") {
        const g = groupOf.get(e.part);
        if (g) facts.toggled.add(g);
        if (g && (e.do === "open" || e.do === "close")) facts.opened.add(g);
      }
      if (e.do === "setProp") facts.setProps.set(e.part, new Set([...(facts.setProps.get(e.part) ?? []), e.prop]));
    }
    if (item && NAV_BARS.has(item.component ?? "") && b.to) facts.tabs.add(b.to);
  });
  return facts;
}

/** whether a tap sets a prop of a part */
export const setsProp = (facts: DocFacts, part: string, prop: string) => !!facts.setProps.get(part)?.has(prop);

/** whether an action (or its else) makes a call or an invoke, or submits: what its answer is told apart by is the part */
export const answers = (a: Action) => [a, a.else].some((b) => (b?.effects ?? []).some((e) => e.do === "call" || e.do === "invoke" || e.do === "submit"));

/** A back action's own motion, for each kit's interpreter to hand its navigator (`Host.back`, `Nav.back`): what the
 *  platform's stack plays its way. None for any other action, and none for a motion that is no motion. */
export const backMotion = (b: Pick<ActionBody, "to" | "motion">) => (b.to === BACK_TARGET ? cleanMotion(b.motion) : undefined);
