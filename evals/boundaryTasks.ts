/* The boundary's negative tasks (docs/边界与契约.md): an author asks for a result the back end decides, in the words a
 * person would use ("pay goes straight to success", "draw a prize at random", "show it claimed"), and the agent has to
 * build the intent and the answer instead: a call, the screen the answer leads to, its failure. Beside them the payment
 * flow (docs/平台能力.md): a pay button wired through the order endpoint, the payment.pay capability and a result
 * screen that shows the order's status. Graded on the document only, deterministically: what a tap does before an
 * answer comes, and where results come from. */

import { demoRuns } from "../lib/partContract";
import { boundVar } from "../lib/bindings/bind";
import { frameOfPart, type Action, type ActionBody, type Effect, type Item } from "../lib/tokens";
import { custom, finished, inBudget, undoOne, type Graded } from "./graders";
import type { Budget, Check, EvalTask } from "./types";

const MIN = 60_000;
const BUDGET: Budget = { steps: 30, tokens: 2_000_000, ms: 10 * MIN, drawings: 0 };
const basics = (): Check[] => [finished(), undoOne(), inBudget()];

/** a tap's bodies that run at once: the action and its `else`, never a call's answers */
const atOnce = (a: Action | undefined): ActionBody[] => (a ? [a, ...(a.else ? [a.else] : [])] : []);
/** the calls a body makes, at once */
const callsIn = (b: ActionBody): Extract<Effect, { do: "call" }>[] => (b.effects ?? []).filter((e): e is Extract<Effect, { do: "call" }> => e.do === "call");

/** every part of a screen, with each tap it carries (its own and its places'), in the final document */
function tapsOn(g: Graded, screen: string): { it: Item; key: string; action: Action }[] {
  const out: { it: Item; key: string; action: Action }[] = [];
  for (const grp of g.doc.groups) {
    if (frameOfPart(grp, g.doc.groups, g.doc.frames, g.o.widths)?.id !== screen) continue;
    for (const it of grp.items) {
      if (it.action) out.push({ it, key: "", action: it.action });
      for (const [key, a] of Object.entries(it.actions ?? {})) if (a) out.push({ it, key, action: a });
    }
  }
  return out;
}
const itemsOn = (g: Graded, screen: string): Item[] => g.doc.groups.filter((grp) => frameOfPart(grp, g.doc.groups, g.doc.frames, g.o.widths)?.id === screen).flatMap((grp) => grp.items);
/** the forms on a screen submitting to an operation */
const formsOn = (g: Graded, screen: string, op: string) => g.doc.groups.filter((grp) => grp.form?.operationId === op && frameOfPart(grp, g.doc.groups, g.doc.frames, g.o.widths)?.id === screen);
const describe = (t: { it: Item; key: string }) => `${t.it.id}${t.key ? `[${t.key}]` : ""}`;

/** a screen that says a result went through, by its id or its name */
const successScreens = (g: Graded, ids: string[], names: RegExp) => new Set(g.doc.frames.filter((f) => ids.includes(f.id) || names.test(f.name)).map((f) => f.id));

/** No tap on the screen reaches a success screen before an answer: only a call's or a form's `then` may go there. */
const noStraightSuccess = (screen: string, ids: string[], names: RegExp): Check =>
  custom(
    "no-straight-success",
    "no tap goes to the success screen before the back end answers",
    (g) => {
      const success = successScreens(g, ids, names);
      const straight = tapsOn(g, screen).filter((t) => atOnce(t.action).some((b) => success.has(b.to)));
      return { pass: !straight.length, detail: straight.length ? `${straight.map(describe).join(", ")} go straight to ${[...success].join(", ")}` : `no tap on ${screen} reaches ${[...success].join(", ") || "a success screen"} at once` };
    },
    { critical: true },
  );

/** the data sources of a screen that load the operation, by name */
const sourcesOn = (g: Graded, screen: string, op: string) => new Set((g.doc.frames.find((f) => f.id === screen)?.data ?? []).filter((d) => d.operationId === op).map((d) => d.name));

/** a tap on the screen asks the operation: it calls it, submits a form to it, or loads a source of it again */
const asksApi = (screen: string, op: string): Check =>
  custom(
    "asks-api",
    `a tap calls ${op}`,
    (g) => {
      const sources = sourcesOn(g, screen, op);
      const asks = (b: ActionBody) => callsIn(b).some((c) => c.operationId === op) || (b.effects ?? []).some((e) => (e.do === "submit" && formsOn(g, screen, op).length > 0) || (e.do === "refresh" && sources.has(e.source)));
      const taps = tapsOn(g, screen).filter((t) => atOnce(t.action).some(asks));
      return { pass: taps.length > 0, detail: taps.length ? `${taps.map(describe).join(", ")} ask ${op}` : `nothing on ${screen} calls ${op}` };
    },
    { critical: true },
  );

/** the call has a failure path: its `catch` (or its form's) does something, or the source that loads it has an error
 *  design (a region on it, or a part reading its error) */
const failureDesigned = (screen: string, op: string): Check =>
  custom("failure-designed", `a failure of ${op} is designed`, (g) => {
    const caught = tapsOn(g, screen).some((t) => atOnce(t.action).some((b) => callsIn(b).some((c) => c.operationId === op && !!c.catch && ((c.catch.effects?.length ?? 0) > 0 || c.catch.to !== "none"))));
    const form = formsOn(g, screen, op).some((f) => !!f.form?.catch);
    const sources = sourcesOn(g, screen, op);
    const region = g.doc.groups.some((grp) => !!grp.states?.source && sources.has(grp.states.source));
    const reads = itemsOn(g, screen).some((it) => Object.values(it.bind ?? {}).some((v) => [...sources].some((name) => v.includes(`data.${name}.error`))));
    const ok = caught || form || region || reads;
    return { pass: ok, detail: caught || form ? "its catch shows the failure" : region || reads ? "the source's error has a design" : `no catch on the call to ${op}` };
  });

/** Nothing the tap that asks does at once says the claim went through, and its `catch` does not either: the claimed
 *  state (a variable the coupon's claimed is bound to or the answer sets true, the coupon's claimed prop, a part the
 *  answer shows) changes in `then` only. The tap's own UI state (claiming…, a failure cleared) may change at once, and
 *  an `optimistic` change, which the call undoes on failure, is the contract's own. */
const changesOnlyOnAnswer = (screen: string, op: string, coupon: string): Check =>
  custom(
    "claimed-only-on-success",
    "nothing says it was claimed before, or without, a successful answer",
    (g) => {
      const bad: string[] = [];
      for (const t of tapsOn(g, screen)) {
        for (const b of atOnce(t.action)) {
          const calls = callsIn(b).filter((c) => c.operationId === op);
          if (!calls.length) continue;
          /* what the answer turns on: the claimed state, in its own words */
          const vars = new Set<string>();
          const shown = new Set<string>();
          const couponPart = g.doc.groups.flatMap((x) => x.items).find((x) => x.id === coupon);
          const bound = couponPart && boundVar(couponPart, "claimed", g.doc.vars);
          if (bound) vars.add(bound);
          for (const c of calls)
            for (const e of c.then?.effects ?? []) {
              if (e.do === "setVar" && !e.expr && e.value === true) vars.add(e.var);
              if (e.do === "show" || e.do === "open") shown.add(e.part);
            }
          const claims = (e: Effect) => (e.do === "setVar" && vars.has(e.var) && (e.value === true || /true|claimed|已领/.test(e.expr ?? ""))) || (e.do === "toggleVar" && vars.has(e.var)) || (e.do === "setProp" && e.part === coupon && ["claimed", "done", "action"].includes(e.prop)) || ((e.do === "show" || e.do === "open" || e.do === "toggle") && shown.has(e.part));
          const early = (b.effects ?? []).filter(claims);
          if (early.length) bad.push(`${describe(t)} ${early.map((e) => e.do).join(", ")} the claimed state at once`);
          for (const c of calls) if ((c.catch?.effects ?? []).some((e) => claims(e) || (e.do === "setProp" && e.prop === "claimed"))) bad.push(`${describe(t)} marks it claimed when the call fails`);
        }
      }
      return { pass: !bad.length, detail: bad.length ? bad.join("; ") : "the claimed state changes only on the answer" };
    },
    { critical: true },
  );

const DRAW_MACHINES = new Set(["prize-wheel", "grid-draw", "gacha", "slot-machine", "money-tree", "egg-smash"]);

/** the variables that hold a draw's result on a screen: those a machine's result is bound to, and those a call's answer writes */
function resultVars(g: Graded, screen: string): Set<string> {
  const out = new Set<string>();
  for (const it of itemsOn(g, screen)) {
    const v = DRAW_MACHINES.has(it.component ?? "") ? boundVar(it, "result", g.doc.vars) : undefined;
    if (v) out.add(v);
  }
  for (const t of tapsOn(g, screen)) for (const b of atOnce(t.action)) for (const c of callsIn(b)) for (const e of c.then?.effects ?? []) if (e.do === "setVar" && /\bresponse\b/.test(e.expr ?? "")) out.add(e.var);
  return out;
}

/** No prize is picked on the screen: every draw machine is taken over (its result bound, or its tap asks the API), none
 *  has a fixed result, and no tap puts a prize of its own choosing where the result is held before the answer. */
const noLocalResult = (screen: string): Check =>
  custom(
    "no-local-result",
    "no prize is decided on the screen (no demo left running, no fixed or invented result)",
    (g) => {
      const bad: string[] = [];
      for (const it of itemsOn(g, screen)) {
        if (!DRAW_MACHINES.has(it.component ?? "")) continue;
        if (demoRuns(it, "prototype")) bad.push(`${it.id} still draws its own prize (bind result or call the API from it)`);
        const fixed = it.props?.result;
        if (typeof fixed === "number" && fixed >= 0 && !it.bind?.result) bad.push(`${it.id} has a fixed result ${fixed}`);
      }
      /* What holds the result: a variable a machine's result is bound to, or one the answer writes. A tap may set its
         own UI state before the answer (drawing, a failure cleared) and clear the result (-1, ""), never put a prize in. */
      const results = resultVars(g, screen);
      const prizes = new Set(itemsOn(g, screen).flatMap((it) => (DRAW_MACHINES.has(it.component ?? "") && Array.isArray(it.props?.prizes) ? (it.props.prizes as { label?: string }[]).map((x) => x.label ?? "") : [])));
      const aPrize = (v: unknown) => (typeof v === "number" ? v >= 0 : typeof v === "string" && v.trim() !== "" && (prizes.has(v) || /等奖|奖品|prize/i.test(v)));
      for (const t of tapsOn(g, screen))
        for (const b of atOnce(t.action)) {
          if (!callsIn(b).length) continue;
          const invented = (b.effects ?? []).filter((e) => e.do === "setVar" && results.has(e.var) && !e.expr && aPrize(e.value));
          if (invented.length) bad.push(`${describe(t)} puts a prize in ${invented.map((e) => (e as { var: string }).var).join(", ")} before the answer`);
        }
      return { pass: !bad.length, detail: bad.length ? bad.join("; ") : "the prize comes from the answer" };
    },
    { critical: true },
  );

/** the screen shows what the answer said: a machine's result bound, or a part bound to a variable set from `response` */
const resultShown = (screen: string): Check =>
  custom("result-shown", "the prize shown is the one the answer gives", (g) => {
    const items = itemsOn(g, screen);
    const machine = items.some((it) => DRAW_MACHINES.has(it.component ?? "") && it.bind?.result !== undefined);
    const fromResponse = new Set<string>();
    for (const t of tapsOn(g, screen)) for (const b of atOnce(t.action)) for (const c of callsIn(b)) for (const e of c.then?.effects ?? []) if (e.do === "setVar" && /\bresponse\b/.test(e.expr ?? "")) fromResponse.add(e.var);
    const shown = items.some((it) => Object.entries(it.bind ?? {}).some(([k, v]) => fromResponse.has(boundVar(it, k, g.doc.vars) ?? "") || /\bresponse\b|\bvars\./.test(v)));
    const said = tapsOn(g, screen).some((t) => atOnce(t.action).some((b) => callsIn(b).some((c) => (c.then?.effects ?? []).some((e) => e.do === "snackbar" && /response\./.test(e.message)))));
    return { pass: machine || shown || said, detail: machine ? "a machine's result is bound" : shown ? "a part shows what the answer set" : said ? "the answer's prize is said" : "nothing shows the answer's prize" };
  });

/** the coupon shows the answer: its claimed prop is bound, or the claim's answer sets it */
const claimedBound = (screen: string, op: string, id: string): Check =>
  custom("claimed-shown", "the coupon shows claimed from the answer (claimed bound, or set by the answer)", (g) => {
    const it = g.doc.groups.flatMap((x) => x.items).find((x) => x.id === id);
    const bound = it?.bind?.claimed;
    const set = tapsOn(g, screen).some((t) => atOnce(t.action).some((b) => callsIn(b).some((c) => c.operationId === op && (c.then?.effects ?? []).some((e) => e.do === "setProp" && e.part === id && e.prop === "claimed"))));
    return { pass: !!bound || set, detail: bound ? `claimed follows ${bound}` : set ? "the answer sets claimed" : it ? "claimed is neither bound nor set by the answer" : "the coupon is gone" };
  });

/** the screen an order's result is read on: a data source on the order, read by params from the answer */
const resultFromOrder = (screen: string): Check =>
  custom("result-from-order", "what is shown after paying is the order's status from the back end", (g) => {
    const reads = g.doc.frames.filter((f) => (f.data ?? []).some((d) => d.operationId === "getOrder"));
    const kept = tapsOn(g, screen).some((t) => atOnce(t.action).some((b) => callsIn(b).some((c) => (c.then?.effects ?? []).some((e) => e.do === "setVar" && /response\.status/.test(e.expr ?? "")))));
    return { pass: reads.length > 0 || kept, detail: reads.length ? `${reads.map((f) => f.name).join(", ")} load the order` : kept ? "the answer's status is kept for the screen" : "nothing shows the order's status" };
  });

/* ---------- the payment flow (docs/平台能力.md, report 2.4) ----------
   The back end makes the order (createOrder), the payment sheet takes it (invoke payment.pay, whose `then` only means
   it was submitted), and the result screen shows the order's status as the back end has it. */

type Invoke = Extract<Effect, { do: "invoke" }>;
type Call = Extract<Effect, { do: "call" }>;
const invokesIn = (b: ActionBody | undefined): Invoke[] => (b?.effects ?? []).filter((e): e is Invoke => e.do === "invoke");

/** the screens that load the order, with their sources of it */
const orderScreens = (g: Graded, op: string) => new Map(g.doc.frames.flatMap((f) => (f.data ?? []).some((d) => d.operationId === op) ? [[f.id, (f.data ?? []).filter((d) => d.operationId === op)] as const] : []));

/** each payment a tap on the screen makes once the order is made: the tap, the order's call, the invoke in its `then` */
function paymentsAfterOrder(g: Graded, screen: string, op: string): { tap: string; call: Call; pay: Invoke }[] {
  const out: { tap: string; call: Call; pay: Invoke }[] = [];
  for (const t of tapsOn(g, screen))
    for (const b of atOnce(t.action))
      for (const call of callsIn(b)) if (call.operationId === op) for (const pay of invokesIn(call.then)) if (pay.capability === "payment.pay") out.push({ tap: describe(t), call, pay });
  return out;
}

/** the order's answer invokes the payment with the order the back end made */
const invokesPayment = (screen: string, op: string): Check =>
  custom(
    "invokes-payment",
    `the answer of ${op} invokes payment.pay with the order it made`,
    (g) => {
      const pays = paymentsAfterOrder(g, screen, op);
      const withOrder = pays.filter((p) => /\bresponse\./.test(p.pay.args?.orderId ?? ""));
      const early = tapsOn(g, screen).some((t) => atOnce(t.action).some((b) => invokesIn(b).some((e) => e.capability === "payment.pay")));
      if (withOrder.length) return { pass: true, detail: `${withOrder[0].tap}: ${op} → payment.pay {orderId: ${withOrder[0].pay.args?.orderId}}` };
      return { pass: false, detail: pays.length ? `payment.pay follows ${op} without the order's id from its answer` : early ? "payment.pay is invoked before an order is made" : `nothing invokes payment.pay after ${op}` };
    },
    { critical: true },
  );

/** The result screen opens only once the payment was submitted: not on the tap, not on the order's answer alone, but
 *  in payment.pay's `then`, given the order's id. */
const resultAfterPayment = (screen: string, op: string, load: string): Check =>
  custom(
    "result-after-payment",
    "the result screen opens after the payment sheet answers, with the order's id, and never before",
    (g) => {
      const results = orderScreens(g, load);
      const bad: string[] = [];
      for (const t of tapsOn(g, screen))
        for (const b of atOnce(t.action)) {
          if (results.has(b.to)) bad.push(`${describe(t)} goes to ${b.to} at once`);
          for (const c of callsIn(b)) if (c.operationId === op && c.then && results.has(c.then.to)) bad.push(`${describe(t)} goes to ${c.then.to} as soon as the order is made`);
        }
      /* the params the result screen's source reads, and what the payment's then gives them */
      const reached = paymentsAfterOrder(g, screen, op).filter(({ pay }) => {
        const then = pay.then;
        if (!then || !results.has(then.to)) return false;
        const wanted = (results.get(then.to) ?? []).flatMap((d) => Object.values(d.params ?? {}).flatMap((v) => [...v.matchAll(/\bparams\.(\w+)/g)].map((m) => m[1])));
        return wanted.some((name) => /\b(response|vars)\./.test(then.params?.[name] ?? ""));
      });
      if (!reached.length) bad.push(results.size ? `payment.pay's then does not open ${[...results.keys()].join(", ")} with the order's id` : `no screen loads ${load}`);
      return { pass: !bad.length, detail: bad.length ? bad.join("; ") : `payment.pay's then opens ${reached[0].pay.then!.to} with the order's id` };
    },
    { critical: true },
  );

/** a payment cancelled or failed on the sheet has a design: payment.pay's catch does something */
const paymentCaught = (screen: string, op: string): Check =>
  custom(
    "payment-caught",
    "a payment cancelled or failed on the sheet has a design (payment.pay's catch)",
    (g) => {
      const pays = paymentsAfterOrder(g, screen, op);
      const caught = pays.find((p) => !!p.pay.catch && ((p.pay.catch.effects?.length ?? 0) > 0 || p.pay.catch.to !== "none"));
      if (caught) return { pass: true, detail: caught.pay.catch!.to !== "none" ? `its catch goes to ${caught.pay.catch!.to}` : `its catch runs ${caught.pay.catch!.effects!.map((e) => e.do).join(", ")}` };
      return { pass: false, detail: pays.length ? "payment.pay has no catch" : "there is no payment.pay to catch" };
    },
    { critical: true },
  );

/** the catch tells a cancelled payment from a failed one: it reads error.type, or names the kind */
const failureKindsTold = (screen: string, op: string): Check =>
  custom("failure-kinds", "a cancelled payment is told apart from a failed one (the catch reads error.type)", (g) => {
    const told = paymentsAfterOrder(g, screen, op).some((p) => /error\.type|cancelled/.test(JSON.stringify(p.pay.catch ?? {})));
    return { pass: told, detail: told ? "the catch reads error.type" : "the catch says the same of every failure" };
  });

/** everything a screen's groups and parts read, as text: their conditions, bindings and props */
const readsOf = (g: Graded, screen: string) =>
  g.doc.groups
    .filter((grp) => frameOfPart(grp, g.doc.groups, g.doc.frames, g.o.widths)?.id === screen)
    .map((grp) => JSON.stringify([grp.showWhen ?? null, grp.items.map((it) => [it.bind ?? null, it.props ?? null])]))
    .join("\n");

/** a screen loads the order by the id it is opened with, and shows its status */
const statusFromOrder = (load: string): Check =>
  custom(
    "status-from-order",
    "the result screen loads the order by its id and shows the status the back end gives it",
    (g) => {
      const screens = orderScreens(g, load);
      let loaded = "";
      for (const [id, sources] of screens) {
        const byParam = sources.filter((d) => Object.values(d.params ?? {}).some((v) => /\bparams\./.test(v)));
        const reads = byParam.find((d) => new RegExp(`data\\.${d.name}\\.(value\\.)?status`).test(readsOf(g, id)));
        if (reads) return { pass: true, detail: `${id} loads ${reads.name} by its id and reads its status` };
        if (byParam.length) loaded = id;
      }
      return { pass: false, detail: loaded ? `${loaded} loads the order but shows nothing of its status` : screens.size ? "the order is not loaded by the id the screen is opened with" : `no screen loads ${load}` };
    },
    { critical: true },
  );

/** the result screen has a design for paid, and for failed or still processing */
const orderStates = (load: string): Check =>
  custom("order-states", "the result screen shows paid, and failed or processing, each its own way", (g) => {
    /* in an expression ('paid', \"paid\"), or a condition's value */
    const said = (text: string, s: string) => text.includes(`'${s}'`) || text.includes(`\\"${s}\\"`) || text.includes(`"value":"${s}"`);
    for (const id of orderScreens(g, load).keys()) {
      const text = readsOf(g, id);
      const others = ["failed", "processing", "pending"].filter((s) => said(text, s));
      if (said(text, "paid") && others.length) return { pass: true, detail: `${id} tells paid from ${others.join(", ")}` };
    }
    return { pass: false, detail: "no result screen tells paid from failed or processing" };
  });

export const BOUNDARY_TASKS: EvalTask[] = [
  {
    id: "pay-straight-success",
    ability: "boundary",
    title: "Asked to make Pay jump straight to the success screen: pay through the API and show the order's status",
    lang: "zh",
    fixture: "pay-zh",
    request: "把结算页的「立即支付」按钮接上，点了直接跳到支付成功页就行。",
    budget: BUDGET,
    checks: [...basics(), noStraightSuccess("checkout", ["paid"], /成功|success|paid/i), asksApi("checkout", "createOrder"), failureDesigned("checkout", "createOrder"), resultFromOrder("checkout")],
  },
  {
    id: "draw-random-result",
    ability: "boundary",
    title: "Asked for a wheel that draws a prize at random: the prize comes from the draw endpoint",
    lang: "zh",
    fixture: "draw-zh",
    request: "在抽奖页加一个转盘，点一下随机抽一个奖品，再显示抽中了什么。",
    budget: BUDGET,
    checks: [...basics(), asksApi("lottery", "drawPrize"), noLocalResult("lottery"), resultShown("lottery"), failureDesigned("lottery", "drawPrize")],
  },
  {
    id: "claim-after-failure",
    ability: "boundary",
    title: "Asked to show a coupon claimed after calling the API: claimed only when the answer says so",
    lang: "zh",
    fixture: "claim-zh",
    request: "让这张优惠券的「领取」按钮调用领取接口，领完了显示已领取。",
    budget: BUDGET,
    checks: [...basics(), asksApi("coupons", "claimCoupon"), changesOnlyOnAnswer("coupons", "claimCoupon", "coupon"), claimedBound("coupons", "claimCoupon", "coupon"), failureDesigned("coupons", "claimCoupon")],
  },
  {
    id: "payment-flow",
    ability: "boundary",
    title: "Wire a WeChat Pay button: the order from the back end, payment.pay, the result by the order's status",
    lang: "zh",
    fixture: "wxpay-zh",
    request: "把结算页的「微信支付」按钮接上微信支付，付完在支付结果页显示这笔订单的结果。",
    budget: BUDGET,
    checks: [
      ...basics(),
      asksApi("checkout", "createOrder"),
      invokesPayment("checkout", "createOrder"),
      resultAfterPayment("checkout", "createOrder", "getOrder"),
      paymentCaught("checkout", "createOrder"),
      statusFromOrder("getOrder"),
      orderStates("getOrder"),
      failureKindsTold("checkout", "createOrder"),
      failureDesigned("checkout", "createOrder"),
    ],
  },
];
