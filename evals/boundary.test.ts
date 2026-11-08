/* The boundary's negative tasks graded on documents made with operations, no model (evals/boundaryTasks.ts): each
 * done the way a good turn would do it passes every check, the shortcut the author asked for (straight to success, a
 * prize drawn on the screen, claimed whatever the answer) fails a critical one, and so does the starting document. */

import { describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, opByName, savedDoc, stateOf, type Tx } from "../lib/core";
import { setGlobalLang } from "../lib/i18n";
import { emptyUsage } from "../lib/llm";
import { fixtureDoc } from "./fixtures";
import { score } from "./graders";
import { taskById } from "./tasks";
import type { Observed } from "./types";

const run = (tx: Tx, name: string, args: Record<string, unknown>) => tx.run(opByName(name)! as never, args as never) as Record<string, unknown> | undefined;
const stay = (effects: unknown[]) => ({ to: "none", effects });

/** a turn's document as the harness observes it, made by `change` (strictly, as the agent's tools run) */
function observe(taskId: string, change: (tx: Tx) => void): Observed {
  const task = taskById(taskId)!;
  setGlobalLang(task.lang);
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("t"), measurer: guessMeasurer, lang: () => task.lang });
  store.load(fixtureDoc(task.fixture), true);
  const start = savedDoc(store.get());
  const startWidths = guessMeasurer.measure(store.get());
  store.transact("AI", "ai", change);
  return {
    task: taskId,
    lang: task.lang,
    request: task.request,
    model: "scripted",
    effort: "medium",
    start,
    final: savedDoc(store.get()),
    startWidths,
    widths: guessMeasurer.measure(store.get()),
    calls: [],
    stop: "end_turn",
    text: "Done.",
    usage: { ...emptyUsage(), input: 1000, output: 100 },
    turnUsage: emptyUsage(),
    ms: 1000,
    steps: 3,
    drawings: 0,
    undo: { steps: 1, restores: true },
    shots: [],
    budget: task.budget,
  };
}

const verdicts = (o: Observed) => score(taskById(o.task)!.checks, o).verdicts;
const failed = (o: Observed) => verdicts(o).filter((v) => !v.pass).map((v) => `${v.id}: ${v.detail}`);
const criticalFailed = (o: Observed) => verdicts(o).filter((v) => !v.pass && v.critical).map((v) => v.id);

describe("paying", () => {
  const good = (tx: Tx) => {
    run(tx, "set_screen_params", { screen: "paid", params: [{ name: "orderId", type: "string" }] });
    run(tx, "add_data_source", { screen: "paid", operationId: "getOrder", params: { orderId: "params.orderId" } });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    run(tx, "set_action", { id: "pay", action: stay([{ do: "call", operationId: "createOrder", args: { productId: "'latte'", quantity: "2" }, then: { to: "paid", params: { orderId: "response.id" } }, catch: stay([{ do: "snackbar", message: "支付没有完成：{{error.title}}" }]) }]) });
  };
  it("through the API, the status read on the result screen, passes", () => expect(failed(observe("pay-straight-success", good))).toEqual([]));
  it("straight to the success screen fails, even with a call made on the way", () => {
    expect(criticalFailed(observe("pay-straight-success", (tx) => run(tx, "set_action", { id: "pay", action: { to: "paid" } })))).toContain("no-straight-success");
    expect(criticalFailed(observe("pay-straight-success", (tx) => run(tx, "set_action", { id: "pay", action: { to: "paid", effects: [{ do: "call", operationId: "createOrder" }] } })))).toEqual(["no-straight-success"]);
  });
  it("is not done in the starting document", () => expect(criticalFailed(observe("pay-straight-success", () => {}))).toContain("asks-api"));
});

describe("the payment flow", () => {
  /** the result screen: the order loaded by the id it is opened with, a design per status */
  const resultScreen = (tx: Tx) => {
    run(tx, "add_data_source", { screen: "result", operationId: "getOrder", name: "order", params: { orderId: "params.orderId" } });
    const said = (id: string, text: string, expr: string) => ({ part: "text", id, props: { text }, showWhen: { expr } });
    run(tx, "add_tree", {
      screen: "result",
      at: { x: 16, y: 96 },
      tree: { part: "box", id: "states", props: { layout: "column", gap: 12 }, children: [said("paid", "支付成功", "data.order.value.status == 'paid'"), said("processing", "支付处理中", "data.order.value.status == 'pending' || data.order.value.status == 'processing'"), said("failed", "支付失败", "data.order.value.status == 'failed'")] },
    });
  };
  // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
  const pay = (then: Record<string, unknown>, c?: Record<string, unknown>) => ({ do: "invoke", capability: "payment.pay", args: { orderId: "response.id", amount: "response.amount", payload: "response.payment" }, then, ...(c ? { catch: c } : {}) });
  // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
  const order = (then: Record<string, unknown>) => ({ do: "call", operationId: "createOrder", args: { productId: "'latte'", quantity: "2" }, then, catch: stay([{ do: "snackbar", message: "订单没有创建成功" }]) });
  /** the catch keeps the failure's kind for the checkout's notices */
  const issue = stay([{ do: "setVar", var: "payIssue", value: "", expr: "error.type" }]);
  const issueVar = (tx: Tx) => run(tx, "add_var", { id: "payIssue", name: "payIssue", type: "text", value: "" });
  const good = (tx: Tx) => {
    resultScreen(tx);
    issueVar(tx);
    run(tx, "set_action", { id: "wxpay", action: stay([order(stay([pay({ to: "result", params: { orderId: "response.id" } }, issue)]))]) });
  };
  it("the order made, handed to payment.pay, the result read from the order, passes", () => expect(failed(observe("payment-flow", good))).toEqual([]));
  it("the result screen opened by the order's answer, before the payment, fails", () => {
    const early = observe("payment-flow", (tx) => {
      resultScreen(tx);
      issueVar(tx);
      run(tx, "set_action", { id: "wxpay", action: stay([order({ to: "result", params: { orderId: "response.id" }, effects: [pay(stay([]), issue)] })]) });
    });
    expect(criticalFailed(early)).toEqual(["result-after-payment"]);
  });
  it("no payment.pay, or one with no catch, fails", () => {
    const noPay = observe("payment-flow", (tx) => {
      resultScreen(tx);
      run(tx, "set_action", { id: "wxpay", action: stay([order({ to: "result", params: { orderId: "response.id" } })]) });
    });
    expect(criticalFailed(noPay)).toEqual(expect.arrayContaining(["invokes-payment", "result-after-payment", "payment-caught"]));
    const uncaught = observe("payment-flow", (tx) => {
      resultScreen(tx);
      run(tx, "set_action", { id: "wxpay", action: stay([order(stay([pay({ to: "result", params: { orderId: "response.id" } })]))]) });
    });
    expect(criticalFailed(uncaught)).toEqual(["payment-caught"]);
  });
  it("a result screen that says paid whatever the order's status fails", () => {
    const o = observe("payment-flow", (tx) => {
      run(tx, "add_data_source", { screen: "result", operationId: "getOrder", name: "order", params: { orderId: "params.orderId" } });
      run(tx, "add_part", { slug: "text", id: "paid", screen: "result", at: { x: 16, y: 96 }, props: { text: "支付成功" } });
      issueVar(tx);
      run(tx, "set_action", { id: "wxpay", action: stay([order(stay([pay({ to: "result", params: { orderId: "response.id" } }, issue)]))]) });
    });
    expect(criticalFailed(o)).toEqual(["status-from-order"]);
  });
  it("is not done in the starting document", () => expect(criticalFailed(observe("payment-flow", () => {}))).toEqual(expect.arrayContaining(["asks-api", "invokes-payment", "status-from-order"])));
});

describe("drawing a prize", () => {
  const wheel = (tx: Tx) => run(tx, "add_part", { slug: "prize-wheel", id: "wheel", screen: "lottery", at: { x: 96, y: 200 } });
  it("asked of the API, the wheel showing its answer, passes", () => {
    const o = observe("draw-random-result", (tx) => {
      wheel(tx);
      run(tx, "add_var", { id: "won", name: "抽中", type: "number", value: -1 });
      run(tx, "bind_prop", { id: "wheel", prop: "result", var: "won" });
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      run(tx, "set_action", { id: "wheel", action: stay([{ do: "setVar", var: "won", value: -1, expr: "-1" }, { do: "call", operationId: "drawPrize", then: stay([{ do: "setVar", var: "won", value: -1, expr: "response.prizeIndex" }]), catch: stay([{ do: "snackbar", message: "这次没抽成，请再试一次" }]) }]) });
    });
    expect(failed(o)).toEqual([]);
  });
  it("drawn by the wheel's own demo, or written before the answer, fails", () => {
    expect(criticalFailed(observe("draw-random-result", wheel))).toEqual(expect.arrayContaining(["asks-api", "no-local-result"]));
    const invented = observe("draw-random-result", (tx) => {
      wheel(tx);
      run(tx, "add_var", { id: "won", name: "抽中", type: "number", value: -1 });
      run(tx, "bind_prop", { id: "wheel", prop: "result", var: "won" });
      run(tx, "set_action", { id: "wheel", action: stay([{ do: "call", operationId: "drawPrize" }, { do: "setVar", var: "won", value: 2 }]) });
    });
    expect(criticalFailed(invented)).toEqual(["no-local-result"]);
    const fixed = observe("draw-random-result", (tx) => {
      wheel(tx);
      run(tx, "set_props", { id: "wheel", props: { result: 2 } });
      run(tx, "set_action", { id: "wheel", action: stay([{ do: "call", operationId: "drawPrize" }]) });
    });
    expect(criticalFailed(fixed)).toEqual(["no-local-result"]);
  });
  it("asked by loading a source of the draw on a tap, the wheel bound to its value, passes", () => {
    const o = observe("draw-random-result", (tx) => {
      wheel(tx);
      run(tx, "add_data_source", { screen: "lottery", operationId: "drawPrize", name: "draw", load: "demand" });
      run(tx, "bind_expression", { id: "wheel", prop: "result", expr: "data.draw.value.prizeIndex ?? -1" });
      run(tx, "add_part", { slug: "text", id: "why", screen: "lottery", at: { x: 16, y: 600 }, props: { text: "" } });
      run(tx, "bind_expression", { id: "why", prop: "text", expr: "data.draw.error.title ?? ''" });
      run(tx, "set_action", { id: "wheel", action: stay([{ do: "refresh", source: "draw" }]) });
    });
    expect(failed(o)).toEqual([]);
  });
  it("may show its own waiting and failure states before the answer", () => {
    const o = observe("draw-random-result", (tx) => {
      wheel(tx);
      run(tx, "add_var", { id: "won", name: "抽中", type: "number", value: -1 });
      run(tx, "add_var", { id: "drawing", name: "drawing", type: "bool", value: false });
      run(tx, "bind_prop", { id: "wheel", prop: "result", var: "won" });
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      run(tx, "set_action", { id: "wheel", action: stay([{ do: "setVar", var: "drawing", value: true }, { do: "setVar", var: "won", value: -1 }, { do: "call", operationId: "drawPrize", then: stay([{ do: "setVar", var: "won", value: -1, expr: "response.prizeIndex" }, { do: "setVar", var: "drawing", value: false }]), catch: stay([{ do: "setVar", var: "drawing", value: false }]) }]) });
    });
    expect(failed(o)).toEqual([]);
  });
});

describe("claiming a coupon", () => {
  const claimed = (tx: Tx) => {
    run(tx, "add_var", { id: "claimed", name: "已领取", type: "bool", value: false });
    run(tx, "bind_prop", { id: "coupon", prop: "claimed", var: "claimed" });
  };
  it("claimed on the answer, the failure said, passes", () => {
    const o = observe("claim-after-failure", (tx) => {
      claimed(tx);
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      run(tx, "set_action", { id: "coupon", slot: "action", action: stay([{ do: "call", operationId: "claimCoupon", args: { couponId: "'new-member'" }, then: stay([{ do: "setVar", var: "claimed", value: true }]), catch: stay([{ do: "snackbar", message: "没领到：{{error.title}}" }]) }]) });
    });
    expect(failed(o)).toEqual([]);
  });
  it("claimed at once beside the call, or on its failure, fails", () => {
    const atOnce = observe("claim-after-failure", (tx) => {
      claimed(tx);
      run(tx, "set_action", { id: "coupon", slot: "action", action: stay([{ do: "call", operationId: "claimCoupon", args: { couponId: "'new-member'" } }, { do: "setVar", var: "claimed", value: true }]) });
    });
    expect(criticalFailed(atOnce)).toEqual(["claimed-only-on-success"]);
    const onFailure = observe("claim-after-failure", (tx) => {
      claimed(tx);
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      run(tx, "set_action", { id: "coupon", slot: "action", action: stay([{ do: "call", operationId: "claimCoupon", args: { couponId: "'new-member'" }, then: stay([{ do: "setVar", var: "claimed", value: true }]), catch: stay([{ do: "setVar", var: "claimed", value: true }]) }]) });
    });
    expect(criticalFailed(onFailure)).toEqual(["claimed-only-on-success"]);
  });
  it("may say it is claiming before the answer", () => {
    const o = observe("claim-after-failure", (tx) => {
      claimed(tx);
      run(tx, "add_var", { id: "claiming", name: "领取中", type: "bool", value: false });
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      run(tx, "set_action", { id: "coupon", slot: "action", action: stay([{ do: "setVar", var: "claiming", value: true }, { do: "call", operationId: "claimCoupon", args: { couponId: "'new-member'" }, then: stay([{ do: "setVar", var: "claimed", value: true }, { do: "setVar", var: "claiming", value: false }]), catch: stay([{ do: "setVar", var: "claiming", value: false }, { do: "snackbar", message: "没领到" }]) }]) });
    });
    expect(failed(o)).toEqual([]);
  });
  it("is not done in the starting document", () => expect(criticalFailed(observe("claim-after-failure", () => {}))).toContain("asks-api"));
});
