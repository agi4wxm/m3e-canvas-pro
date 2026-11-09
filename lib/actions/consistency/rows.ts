/* The consistency table: each row a small design, what a visitor does to it, and what every host must end up with
 * (docs/交互规则.md says why). The interpreter (lib/actions) passes every row; a host that does not is listed under the
 * row's `known`, with why, until it runs on the interpreter. To add a row: write it here, run `bun run test` (the
 * interpreter, the preview and both web hosts), `bun run gen:rn` and `bun run gen:miniapp` (they write the table into
 * the kits' test beds), then the kits' own tests; list a host under `known` only with its reason. */

import type { Action, ActionBody, Answer, Condition, Effect } from "../model";
import type { Design, PartSpec, Row } from "./types";

const HOME = { id: "home", name: "Home" };
const NEXT = { id: "next", name: "Next" };
const DONE = { id: "done", name: "Done" };
const OTHER = { id: "other", name: "Other" };

/** a tap that stays where it is and runs these effects */
const stay = (...effects: Effect[]): Action => ({ to: "none", effects });
/** a move with no animation: what every host plays at once */
const INSTANT = { kind: "instant" as const };
/* a move to a screen (not staying, going back or out to a page, which play no move of their own) is at once */
const atOnce = (to: string) => (to === "none" || to === "back" || to === "link" ? {} : { motion: INSTANT });
const goTo = (to: string, ...effects: Effect[]): Action => ({ to, ...atOnce(to), effects });
const body = (to: string, ...effects: Effect[]): ActionBody => ({ to, ...atOnce(to), effects });
const btn = (id: string, label: string, action: Action, more: Partial<PartSpec> = {}): PartSpec => ({ id, label, action, ...more });
const text = (id: string, label: string, more: Partial<PartSpec> = {}): PartSpec => ({ id, kind: "text", label, ...more });
/** a call; `ok` is its `then`, `fail` its `catch` */
function call(operationId: string, more: { args?: Record<string, string>; ok?: Answer; fail?: Answer } = {}): Effect {
  const { ok, fail, ...rest } = more;
  // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
  return { do: "call", operationId, ...rest, ...(ok ? { then: ok } : {}), ...(fail ? { catch: fail } : {}) };
}
/** an invoke of a capability; `ok` is its `then`, `fail` its `catch` */
function invoke(capability: string, more: { args?: Record<string, string>; ok?: Answer; fail?: Answer } = {}): Effect {
  const { ok, fail, ...rest } = more;
  // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
  return { do: "invoke", capability, ...rest, ...(ok ? { then: ok } : {}), ...(fail ? { catch: fail } : {}) };
}
/** an answer that branches on what it says: `yes` when the condition holds, `no` when it does not */
const branch = (when: Condition, yes: ActionBody, no: ActionBody): Answer => ({ ...yes, when, else: no });
const toast = (message: string): Effect => ({ do: "snackbar", message });
const setVar = (v: string, value: string | number | boolean, expr?: string): Effect => ({ do: "setVar", var: v, value, ...(expr ? { expr } : {}) });
const num = (id: string, value: number) => ({ id, name: id, type: "number" as const, value });
const words = (id: string, value: string) => ({ id, name: id, type: "text" as const, value });
const bool = (id: string, value: boolean) => ({ id, name: id, type: "bool" as const, value });
const op = (operationId: string, more: Partial<Design["api"] extends (infer O)[] | undefined ? O : never> = {}) => ({ operationId, path: `/${operationId}`, ...more });

/* reasons the hosts share, with the report's sections */
const WEB_PROTO_NO_API = "原型 Web 导出没有接口：调用、刷新、提交、退出登录不发出，运行时在控制台说一次、导出的 README 里列出（要运行它们请导出完整产品；报告 6.2、9.4）";
const WEB_PROTO_NO_RESTART = "原型 Web 导出不会重新开始：它没有模拟库的场景，也不换后端，表的“重新开始”在它上面不发生（能力由模拟库按预览的方式回答）";

export const ROWS: Row[] = [
  /* ---------- order ---------- */
  {
    id: "order-setvar-then-call",
    title: "先设变量再调用：接口参数读到新值",
    ref: "顺序；报告 6.2、6.3",
    design: { screens: [HOME], vars: [num("qty", 1)], api: [op("create", { body: { qty: { title: "Qty", type: "number" } } })], parts: [btn("go", "Order five", stay(setVar("qty", 5), call("create", { args: { qty: "vars.qty" } })))] },
    steps: [{ tap: "Order five" }],
    expect: { vars: { qty: 5 }, calls: [{ op: "create", in: { qty: 5 } }] },
    known: { webPrototype: WEB_PROTO_NO_API },
  },
  {
    id: "order-call-then-setvar",
    title: "先调用再设变量：接口参数读到旧值",
    ref: "顺序；报告 6.2",
    design: { screens: [HOME], vars: [num("qty", 1)], api: [op("create", { body: { qty: { title: "Qty", type: "number" } } })], parts: [btn("go", "Order then set", stay(call("create", { args: { qty: "vars.qty" } }), setVar("qty", 5)))] },
    steps: [{ tap: "Order then set" }],
    expect: { vars: { qty: 5 }, calls: [{ op: "create", in: { qty: 1 } }] },
    known: { webPrototype: WEB_PROTO_NO_API },
  },
  {
    id: "order-local-reads-previous",
    title: "后一个效果读前一个效果写入的值",
    ref: "顺序；报告 6.3",
    design: { screens: [HOME], vars: [num("n", 1), num("m", 0)], parts: [btn("go", "Count", stay({ do: "addVar", var: "n", by: 1 }, setVar("m", 0, "vars.n * 10")))] },
    steps: [{ tap: "Count" }],
    expect: { vars: { n: 2, m: 20 } },
  },
  {
    id: "order-nav-params-after-effects",
    title: "跳转参数在所有效果之后读",
    ref: "顺序；报告 6.3",
    design: {
      screens: [HOME, { ...NEXT, params: ["id"] }],
      vars: [words("pick", "p1")],
      parts: [btn("open", "Open p7", { ...goTo("next", setVar("pick", "p7")), params: { id: "vars.pick" } }), btn("say", "Say id", stay(toast("Id {{params.id}}")), { screen: "next" })],
    },
    steps: [{ tap: "Open p7" }, { tap: "Say id" }],
    expect: { screen: "next", toast: "Id p7" },
    known: {
      webPrototype: "原型 Web 导出没有屏幕参数（参数只属于绑定接口的产品）",
    },
  },
  {
    id: "order-call-not-awaited",
    title: "调用不等回答：后面的效果和跳转立刻进行",
    ref: "顺序；docs/数据绑定.md",
    design: { screens: [HOME, NEXT], vars: [bool("done", false)], api: [op("slow")], parts: [btn("go", "Send and go", goTo("next", call("slow"), setVar("done", true)))] },
    hold: ["slow"],
    steps: [{ tap: "Send and go" }],
    expect: { vars: { done: true }, screen: "next", calls: [{ op: "slow", in: {} }] },
    known: { webPrototype: WEB_PROTO_NO_API },
  },

  /* ---------- conditions ---------- */
  {
    id: "cond-var-else",
    title: "变量条件不成立时走 else",
    ref: "条件",
    design: { screens: [HOME], vars: [bool("flag", false), words("r", "")], parts: [btn("go", "Decide", { ...stay(setVar("r", "yes")), when: { expr: "vars.flag == true" }, else: body("none", setVar("r", "no")) })] },
    steps: [{ tap: "Decide" }],
    expect: { vars: { r: "no" } },
  },
  {
    id: "cond-expr-unreadable",
    title: "表达式条件读不出来：当作不成立，走 else",
    ref: "条件；报告 6.2、6.3",
    design: { screens: [HOME], vars: [words("r", "")], parts: [btn("go", "Check ready", { ...stay(setVar("r", "then")), when: { expr: "data.x.ready" }, else: body("none", setVar("r", "else")) })] },
    steps: [{ tap: "Check ready" }],
    expect: { vars: { r: "else" } },
  },
  {
    id: "cond-expr-holds",
    title: "表达式条件成立时走本身",
    ref: "条件",
    design: { screens: [HOME], vars: [num("n", 2), words("r", "")], parts: [btn("go", "Check n", { ...stay(setVar("r", "big")), when: { expr: "vars.n > 1" }, else: body("none", setVar("r", "small")) })] },
    steps: [{ tap: "Check n" }],
    expect: { vars: { r: "big" } },
  },
  {
    id: "cond-filled",
    title: "“已填写”条件读输入框里的内容",
    ref: "条件",
    design: {
      screens: [HOME],
      vars: [words("r", "")],
      parts: [{ id: "name", kind: "field", label: "Your name" }, btn("go", "Check name", { ...stay(setVar("r", "filled")), when: { filled: "name" }, else: body("none", setVar("r", "empty")) })],
    },
    steps: [{ type: "Your name", value: "Ada" }, { tap: "Check name" }],
    expect: { vars: { r: "filled" } },
  },

  {
    id: "cond-filled-form-field",
    title: "“已填写”条件读表单里的输入框",
    ref: "条件；报告 6.2",
    design: {
      screens: [HOME],
      vars: [words("r", "")],
      api: [op("note", { body: { text: { title: "Note" } } })],
      forms: [{ operationId: "note", submit: "Save note" }],
      parts: [btn("go", "Check note", { ...stay(setVar("r", "filled")), when: { filled: "@field:text" }, else: body("none", setVar("r", "empty")) }, { unchecked: true })],
    },
    steps: [{ type: "Note", value: "hi" }, { tap: "Check note" }],
    expect: { vars: { r: "filled" } },
  },

  /* ---------- what starts an action ---------- */
  {
    id: "trigger-delay",
    title: "延迟触发：屏幕进入使用后自己运行",
    ref: "触发方式；报告 6.2",
    design: { screens: [HOME, NEXT], parts: [text("splash", "Welcome", { action: { ...goTo("next"), trigger: { on: "delay", ms: 40 } } })] },
    steps: [{ wait: 120 }],
    expect: { screen: "next" },
  },
  {
    id: "trigger-hover",
    title: "指针移入触发；没有指针的平台上点一下",
    ref: "触发方式；报告 6.2",
    design: { screens: [HOME], parts: [btn("peek", "Peek", { ...stay(toast("Peeked")), trigger: { on: "hover" } })] },
    steps: [{ hover: "Peek" }],
    expect: { toast: "Peeked" },
  },

  /* ---------- a part's events and families of places ---------- */
  {
    id: "event-runs-action",
    title: "组件的事件运行它的动作，读事件带来的 event",
    ref: "事件与槽位族；第二批 B1 的部件声明",
    design: { screens: [HOME], vars: [words("entered", "")], parts: [{ id: "pad", kind: "numpad", label: "Pay now", actions: { "on:submit": stay(setVar("entered", "", "event.value"), toast("Paid {{event.value}}")) } }] },
    steps: [{ emit: "Pay now", event: "submit", payload: { value: "42", extra: "ignored" } }],
    expect: { vars: { entered: "42" }, toast: "Paid 42" },
  },
  {
    id: "family-runs-action",
    title: "槽位族的动作对每一项都运行，读被点的那一项 slot；某一项自己的动作优先",
    ref: "事件与槽位族；第二批 B1 的部件声明",
    design: {
      screens: [HOME],
      vars: [num("picked", -1), words("own", "")],
      parts: [{ id: "row", kind: "buttons", label: "Small", items: ["Medium", "Large"], actions: { "tab:*": stay(setVar("picked", 0, "slot.index")), "tab:0": stay(setVar("own", "small")) } }],
    },
    steps: [{ tapSlot: "Small", slot: "tab:2" }, { tapSlot: "Small", slot: "tab:0" }],
    expect: { vars: { picked: 2, own: "small" } },
  },
  {
    id: "family-entry-added-later",
    title: "槽位族的动作也对设计属性里没有、运行时由绑定数据或点击加出来的项运行",
    ref: "事件与槽位族；第四批第三波 G3",
    design: {
      screens: [HOME],
      vars: [num("picked", -1)],
      parts: [{ id: "row", kind: "buttons", label: "Small", items: ["Medium", "Large"], actions: { "tab:*": stay(setVar("picked", 0, "slot.index")) } }],
    },
    /* the design's props hold three entries (tab:0 to tab:2); the sixth came from data while the app ran */
    steps: [{ tapSlot: "Small", slot: "tab:5" }],
    expect: { vars: { picked: 5 } },
  },

  /* ---------- show, hide, open, close ---------- */
  {
    id: "hide-visible",
    title: "隐藏一开始可见的部件",
    ref: "显示与隐藏；报告 6.2、6.3",
    design: { screens: [HOME], parts: [text("p", "Promo"), btn("go", "Hide promo", stay({ do: "hide", part: "p" }))] },
    steps: [{ tap: "Hide promo" }],
    expect: { shown: { Promo: false, "Hide promo": true } },
  },
  {
    id: "show-hidden",
    title: "显示一开始隐藏的部件",
    ref: "显示与隐藏",
    design: { screens: [HOME], parts: [text("p", "Secret", { hidden: true }), btn("go", "Reveal", stay({ do: "show", part: "p" }))] },
    steps: [{ tap: "Reveal" }],
    expect: { shown: { Secret: true } },
  },
  {
    id: "toggle-twice",
    title: "切换两次回到原样",
    ref: "显示与隐藏",
    design: { screens: [HOME], parts: [text("p", "Banner"), btn("go", "Flip banner", stay({ do: "toggle", part: "p" }))] },
    steps: [{ tap: "Flip banner" }, { tap: "Flip banner" }],
    expect: { shown: { Banner: true } },
  },
  {
    id: "close-menu-keeps-trigger",
    title: "关闭菜单：菜单关上，触发按钮还在",
    ref: "打开与关闭；报告 6.2、6.3",
    design: {
      screens: [HOME],
      parts: [{ id: "menu", kind: "menu", label: "Options", items: ["Rename"] }, btn("open", "Open options", stay({ do: "open", part: "menu" })), btn("close", "Close options", stay({ do: "close", part: "menu" }))],
    },
    steps: [{ tap: "Open options" }, { tap: "Close options" }],
    expect: { shown: { Options: true, Rename: false } },
  },
  {
    id: "open-menu",
    title: "打开菜单：菜单项出现",
    ref: "打开与关闭",
    design: { screens: [HOME], parts: [{ id: "menu", kind: "menu", label: "Choices", items: ["Duplicate"] }, btn("open", "Show choices", stay({ do: "open", part: "menu" }))] },
    steps: [{ tap: "Show choices" }],
    expect: { shown: { Choices: true, Duplicate: true } },
  },

  /* ---------- variables, props, words ---------- */
  {
    id: "setvar-expr",
    title: "设为变量可以用表达式取值",
    ref: "变量；报告 6.2",
    design: { screens: [HOME], vars: [num("a", 2), num("b", 3), num("total", 0)], parts: [btn("go", "Add up", stay(setVar("total", 0, "vars.a + vars.b")))] },
    steps: [{ tap: "Add up" }],
    expect: { vars: { total: 5 } },
  },
  {
    id: "setvar-coerce",
    title: "写不进变量类型的值不写",
    ref: "变量",
    design: { screens: [HOME], vars: [num("n", 4)], parts: [btn("bad", "Set words", stay(setVar("n", "abc"))), btn("good", "Set seven", stay(setVar("n", "7")))] },
    steps: [{ tap: "Set words" }],
    expect: { vars: { n: 4 } },
  },
  {
    id: "addvar-tenths",
    title: "计数器按十分之一累加不出现浮点尾数",
    ref: "变量",
    design: { screens: [HOME], vars: [num("x", 0)], parts: [btn("go", "Add a tenth", stay({ do: "addVar", var: "x", by: 0.1 }))] },
    steps: [{ tap: "Add a tenth" }, { tap: "Add a tenth" }, { tap: "Add a tenth" }],
    expect: { vars: { x: 0.3 } },
  },
  {
    id: "togglevar",
    title: "切换布尔变量",
    ref: "变量",
    design: { screens: [HOME], vars: [bool("on", false)], parts: [btn("go", "Switch", stay({ do: "toggleVar", var: "on" }))] },
    steps: [{ tap: "Switch" }],
    expect: { vars: { on: true } },
  },
  {
    id: "snackbar-template",
    title: "提示条的文字读表达式",
    ref: "提示条",
    design: { screens: [HOME], vars: [words("who", "Ada")], parts: [btn("go", "Greet", stay(toast("Hello {{vars.who}}")))] },
    steps: [{ tap: "Greet" }],
    expect: { toast: "Hello Ada" },
  },
  {
    id: "setprop-text",
    title: "设置属性改部件的文字",
    ref: "设置属性",
    design: { screens: [HOME], parts: [text("title", "Old title"), btn("go", "Retitle", stay({ do: "setProp", part: "title", prop: "text", value: "New title" }))] },
    steps: [{ tap: "Retitle" }],
    expect: { shown: { "Old title": false, "New title": true } },
  },

  /* ---------- calls ---------- */
  {
    id: "call-then-response",
    title: "成功后运行 then，读 response",
    ref: "调用接口",
    design: { screens: [HOME], vars: [num("n", 0)], api: [op("count", { returns: { n: "number" } })], parts: [btn("go", "Fetch count", stay(call("count", { ok: body("none", setVar("n", 0, "response.n"), toast("Got {{response.n}}")) })))] },
    answers: { count: { status: 200, body: { n: 3 } } },
    steps: [{ tap: "Fetch count" }],
    expect: { vars: { n: 3 }, toast: "Got 3", calls: [{ op: "count", in: {} }] },
    known: { webPrototype: WEB_PROTO_NO_API },
  },
  {
    id: "call-catch-error",
    title: "失败后运行 catch，读 status",
    ref: "调用接口",
    design: { screens: [HOME], api: [op("save")], parts: [btn("go", "Try save", stay(call("save", { fail: body("none", toast("Failed {{status}}")) })))] },
    answers: { save: { status: 500, body: {} } },
    steps: [{ tap: "Try save" }],
    expect: { toast: "Failed 500" },
    known: { webPrototype: WEB_PROTO_NO_API },
  },
  {
    id: "call-then-branch",
    title: "回答上的条件：then 按回答走本身或 else",
    ref: "回答上的条件；交接 4.1 第 6 条",
    design: { screens: [HOME], vars: [words("state", "")], api: [op("pay", { returns: { state: "string" } })], parts: [btn("go", "Pay now", stay(call("pay", { ok: branch({ expr: "response.state == 'paid'" }, body("none", setVar("state", "paid")), body("none", setVar("state", "pending"))) })))] },
    answers: { pay: { status: 200, body: { state: "pending" } } },
    steps: [{ tap: "Pay now" }],
    expect: { vars: { state: "pending" } },
    known: { webPrototype: WEB_PROTO_NO_API, },
  },
  {
    id: "call-catch-branch",
    title: "回答上的条件：catch 按 status 分支",
    ref: "回答上的条件",
    design: { screens: [HOME], api: [op("claim")], parts: [btn("go", "Claim it", stay(call("claim", { fail: branch({ expr: "status == 409" }, body("none", toast("Taken")), body("none", toast("Failed {{status}}"))) })))] },
    answers: { claim: { status: 500, body: {} } },
    steps: [{ tap: "Claim it" }],
    expect: { toast: "Failed 500" },
    known: { webPrototype: WEB_PROTO_NO_API, },
  },
  {
    id: "call-unauthorized-no-catch",
    title: "因为没有会话被拒绝（401）：不运行 catch",
    ref: "调用接口；会话",
    design: { screens: [HOME], api: [op("secret")], parts: [btn("go", "Ask secret", stay(call("secret", { fail: body("none", toast("Refused")) })))] },
    answers: { secret: { status: 401, body: {} } },
    steps: [{ tap: "Ask secret" }],
    expect: { toast: null },
  },
  {
    id: "call-then-tap-screen",
    title: "then 在点击那一屏运行：读那一屏的参数，点击自己的跳转不算离开",
    ref: "冻结的点击上下文；报告 7.1",
    design: {
      screens: [HOME, { ...NEXT, params: ["cat"] }, DONE],
      api: [op("ping", { returns: { n: "number" } })],
      parts: [btn("open", "Open tea", { ...goTo("next"), params: { cat: "'tea'" } }), btn("go", "Ping and go", goTo("done", call("ping", { ok: body("none", toast("Pong {{params.cat}}")) })), { screen: "next" })],
    },
    hold: ["ping"],
    steps: [{ tap: "Open tea" }, { tap: "Ping and go" }, { answer: "ping", body: { n: 1 } }],
    expect: { screen: "done", toast: "Pong tea" },
    known: { webPrototype: WEB_PROTO_NO_API },
  },
  {
    id: "call-then-reads-vars-now",
    title: "then 读回答到达时的变量",
    ref: "冻结的点击上下文",
    design: {
      screens: [HOME],
      vars: [num("n", 1), num("seen", 0)],
      api: [op("ping")],
      parts: [btn("go", "Ping later", stay(call("ping", { ok: body("none", setVar("seen", 0, "vars.n")) }))), btn("bump", "Bump n", stay({ do: "addVar", var: "n", by: 1 }))],
    },
    hold: ["ping"],
    steps: [{ tap: "Ping later" }, { tap: "Bump n" }, { answer: "ping" }],
    expect: { vars: { n: 2, seen: 2 } },
    known: { webPrototype: WEB_PROTO_NO_API },
  },
  {
    id: "call-nesting-limit",
    title: "then 里嵌套调用最多四层",
    ref: "嵌套上限；报告 6.2、6.3",
    design: {
      screens: [HOME],
      api: [op("c0"), op("c1"), op("c2"), op("c3"), op("c4"), op("c5")],
      parts: [
        btn(
          "go",
          "Chain",
          stay(call("c0", { ok: body("none", call("c1", { ok: body("none", call("c2", { ok: body("none", call("c3", { ok: body("none", call("c4", { ok: body("none", call("c5")) })) })) })) })) })),
          { unchecked: true },
        ),
      ],
    },
    steps: [{ tap: "Chain" }],
    expect: { calls: [{ op: "c0", in: {} }, { op: "c1", in: {} }, { op: "c2", in: {} }, { op: "c3", in: {} }, { op: "c4", in: {} }] },
    known: {
      webPrototype: WEB_PROTO_NO_API,
    },
  },

  /* ---------- answers that come late ---------- */
  {
    id: "late-restart",
    title: "重新开始后到达的回答什么都不做",
    ref: "迟到的回答；报告 7.1",
    design: { screens: [HOME], vars: [bool("saved", false)], api: [op("save")], parts: [btn("go", "Save later", stay(call("save", { ok: body("none", setVar("saved", true), toast("Saved")), fail: body("none", toast("Not saved")) })))] },
    hold: ["save"],
    steps: [{ tap: "Save later" }, { restart: true }, { answer: "save" }],
    expect: { vars: { saved: false }, toast: null },
    known: { webPrototype: WEB_PROTO_NO_API },
  },
  {
    id: "late-superseded",
    title: "同一组件又调用了同一接口：旧回答让位给新的",
    ref: "迟到的回答；整改计划第一批遗留",
    design: { screens: [HOME], vars: [num("last", 0)], api: [op("pick", { returns: { n: "number" } })], parts: [btn("go", "Pick", stay(call("pick", { ok: body("none", setVar("last", 0, "response.n")) })))] },
    hold: ["pick"],
    steps: [{ tap: "Pick" }, { tap: "Pick" }, { answer: "pick", which: "newest", body: { n: 2 } }, { answer: "pick", body: { n: 1 } }],
    expect: { vars: { last: 2 } },
    known: { webPrototype: WEB_PROTO_NO_API },
  },
  {
    id: "late-moved-then",
    title: "访客已离开：then 的效果照常运行，跳转不再发生",
    ref: "迟到的回答",
    design: {
      screens: [HOME, DONE, OTHER],
      vars: [bool("saved", false)],
      api: [op("save")],
      parts: [btn("go", "Save it", stay(call("save", { ok: body("done", setVar("saved", true)) }))), btn("leave", "Leave", goTo("other"))],
    },
    hold: ["save"],
    steps: [{ tap: "Save it" }, { tap: "Leave" }, { answer: "save" }],
    expect: { vars: { saved: true }, screen: "other" },
    known: { webPrototype: WEB_PROTO_NO_API },
  },
  {
    id: "late-moved-catch",
    title: "访客已离开：catch 的提示条照常出现",
    ref: "迟到的回答",
    design: { screens: [HOME, OTHER], api: [op("save")], parts: [btn("go", "Save badly", stay(call("save", { fail: body("none", toast("Could not save")) }))), btn("leave", "Leave", goTo("other"))] },
    hold: ["save"],
    steps: [{ tap: "Save badly" }, { tap: "Leave" }, { answer: "save", status: 500 }],
    expect: { toast: "Could not save", screen: "other" },
    known: { webPrototype: WEB_PROTO_NO_API },
  },

  /* ---------- forms ---------- */
  {
    id: "form-submit",
    title: "提交表单：请求体是输入框的内容，成功后运行表单的 then",
    ref: "表单",
    design: { screens: [HOME], api: [op("note", { body: { text: { title: "Note", required: true } } })], forms: [{ operationId: "note", submit: "Save note", ok: body("none", toast("Saved {{form.values.text}}")) }], parts: [] },
    steps: [{ type: "Note", value: "hi" }, { tap: "Save note" }],
    expect: { toast: "Saved hi", calls: [{ op: "note", in: { text: "hi" } }] },
    known: { webPrototype: WEB_PROTO_NO_API },
  },
  {
    id: "form-invalid",
    title: "必填字段为空：不发请求",
    ref: "表单",
    design: { screens: [HOME], api: [op("note", { body: { text: { title: "Note", required: true } } })], forms: [{ operationId: "note", submit: "Save note", ok: body("none", toast("Saved")) }], parts: [] },
    steps: [{ tap: "Save note" }],
    expect: { toast: null, calls: [] },
  },
  {
    id: "form-second-press",
    title: "提交中再按一次：不算新的提交，也不算失败",
    ref: "表单",
    design: { screens: [HOME], api: [op("note", { body: { text: { title: "Note", required: true } } })], forms: [{ operationId: "note", submit: "Save note", ok: body("none", toast("Saved")), fail: body("none", toast("Failed")) }], parts: [] },
    hold: ["note"],
    steps: [{ type: "Note", value: "hi" }, { tap: "Save note" }, { tap: "Save note" }, { answer: "note" }],
    expect: { toast: "Saved", calls: [{ op: "note", in: { text: "hi" } }] },
    known: { webPrototype: WEB_PROTO_NO_API },
  },

  /* ---------- the session ---------- */
  {
    id: "signout-ends-session",
    title: "退出登录：会话结束，auth.signedIn 读作 false",
    ref: "会话",
    design: {
      screens: [HOME],
      api: [op("login", { returns: { token: "string" } })],
      login: "login",
      parts: [
        btn("in", "Sign in", stay(call("login"))),
        btn("out", "Sign out", stay({ do: "signOut" })),
        btn("check", "Who", { ...stay(toast("in")), when: { expr: "auth.signedIn" }, else: body("none", toast("out")) }),
      ],
    },
    answers: { login: { status: 200, body: { token: "t1" } } },
    steps: [{ tap: "Sign in" }, { tap: "Sign out" }, { tap: "Who" }],
    expect: { toast: "out", calls: [{ op: "login", in: {} }] },
    known: { webPrototype: WEB_PROTO_NO_API },
  },
  {
    id: "signout-on-required-screen",
    title: "在需要登录的屏幕上退出登录：去登录页",
    ref: "会话；报告 6.2",
    design: {
      screens: [HOME, { id: "account", name: "Account", auth: "required" }, { id: "login", name: "Login", auth: "login" }],
      api: [op("login", { returns: { token: "string" } })],
      login: "login",
      parts: [btn("in", "Sign in", stay(call("login"))), btn("acct", "Account", goTo("account")), btn("out", "Sign out", stay({ do: "signOut" }), { screen: "account" })],
    },
    answers: { login: { status: 200, body: { token: "t1" } } },
    steps: [{ tap: "Sign in" }, { tap: "Account" }, { tap: "Sign out" }],
    expect: { screen: "login" },
    known: {
      webPrototype: WEB_PROTO_NO_API,
    },
  },

  /* ---------- invoking a capability ---------- */
  {
    id: "invoke-then-result",
    title: "调用能力：完成后运行 then，读 result",
    ref: "调用能力；报告 2.3",
    design: { screens: [HOME], vars: [words("got", "")], parts: [btn("pay", "Pay", stay(invoke("payment.pay", { args: { orderId: "'o1'", amount: "12.5" }, ok: body("none", setVar("got", "", "result.status")) })))] },
    capabilities: { "payment.pay": { result: { status: "submitted" } } },
    steps: [{ tap: "Pay" }],
    expect: { vars: { got: "submitted" }, invokes: [{ op: "payment.pay", in: { orderId: "o1", amount: 12.5 } }] },
  },
  {
    id: "invoke-then-branch",
    title: "回答上的条件：能力的 then 按 result 分支",
    ref: "回答上的条件；调用能力",
    design: { screens: [HOME], vars: [words("read", "")], parts: [btn("scan", "Scan it", stay(invoke("scan.code", { ok: branch({ expr: "result.text" }, body("none", setVar("read", "", "result.text")), body("none", setVar("read", "nothing"))) })))] },
    capabilities: { "scan.code": { result: { text: "", format: "qr" } } },
    steps: [{ tap: "Scan it" }],
    expect: { vars: { read: "nothing" } },
  },
  {
    id: "invoke-catch-type",
    title: "调用能力失败：运行 catch，读 error.type",
    ref: "调用能力；报告 2.3、2.4",
    design: { screens: [HOME], vars: [words("why", "")], parts: [btn("pay", "Pay", stay(invoke("payment.pay", { args: { orderId: "'o1'" }, fail: body("none", setVar("why", "", "error.type"), toast("Not paid: {{error.type}}")) })))] },
    capabilities: { "payment.pay": { fail: "cancelled" } },
    steps: [{ tap: "Pay" }],
    expect: { vars: { why: "cancelled" }, toast: "Not paid: cancelled", invokes: [{ op: "payment.pay", in: { orderId: "o1" } }] },
  },
  {
    id: "invoke-not-implemented",
    title: "能力的适配还没写：catch 读到 not-implemented",
    ref: "调用能力；报告 2.3",
    design: { screens: [HOME], vars: [words("why", "")], parts: [btn("share", "Share", stay(invoke("share.open", { args: { url: "'https://example.com'" }, fail: body("none", setVar("why", "", "error.type")) })))] },
    capabilities: { "share.open": { fail: "not-implemented" } },
    steps: [{ tap: "Share" }],
    expect: { vars: { why: "not-implemented" } },
  },
  {
    id: "invoke-not-awaited",
    title: "调用能力不等结果：后面的效果和跳转立刻进行",
    ref: "调用能力；顺序",
    design: { screens: [HOME, NEXT], vars: [bool("done", false)], parts: [btn("scan", "Scan and go", goTo("next", invoke("scan.code"), setVar("done", true)))] },
    hold: ["scan.code"],
    steps: [{ tap: "Scan and go" }],
    expect: { vars: { done: true }, screen: "next", invokes: [{ op: "scan.code", in: {} }] },
  },
  {
    id: "invoke-args-at-step",
    title: "能力的参数在它那一步读",
    ref: "调用能力；顺序",
    design: { screens: [HOME], vars: [words("text", "")], parts: [btn("copy", "Copy", stay(setVar("text", "copied words"), invoke("clipboard.write", { args: { text: "vars.text" } }), setVar("text", "later")))] },
    steps: [{ tap: "Copy" }],
    expect: { vars: { text: "later" }, invokes: [{ op: "clipboard.write", in: { text: "copied words" } }] },
  },
  {
    id: "invoke-in-call-then",
    title: "下单后调用支付：能力的参数和 then 都读得到接口的回答，完成后跳转",
    ref: "调用能力；报告 2.4",
    design: {
      screens: [HOME, DONE],
      vars: [words("order", "")],
      api: [op("createOrder", { returns: { id: "string" } })],
      parts: [btn("place", "Place order", stay(call("createOrder", { ok: body("none", invoke("payment.pay", { args: { orderId: "response.id" }, ok: body("done", setVar("order", "", "response.id")) })) })))],
    },
    answers: { createOrder: { status: 200, body: { id: "o42" } } },
    steps: [{ tap: "Place order" }],
    expect: { screen: "done", vars: { order: "o42" }, calls: [{ op: "createOrder", in: {} }], invokes: [{ op: "payment.pay", in: { orderId: "o42" } }] },
    known: { webPrototype: WEB_PROTO_NO_API },
  },
  {
    id: "invoke-late-moved",
    title: "访客已离开：能力 then 的效果照常运行，跳转不再发生",
    ref: "调用能力；迟到的回答",
    design: {
      screens: [HOME, NEXT, OTHER],
      vars: [words("got", "")],
      parts: [btn("pay", "Pay", stay(invoke("payment.pay", { args: { orderId: "'o1'" }, ok: body("next", setVar("got", "", "result.status")) }))), btn("away", "Elsewhere", goTo("other"))],
    },
    hold: ["payment.pay"],
    steps: [{ tap: "Pay" }, { tap: "Elsewhere" }, { answer: "payment.pay", body: { status: "submitted" } }],
    expect: { vars: { got: "submitted" }, screen: "other" },
  },
  {
    id: "invoke-late-platform-back",
    title: "访客已离开：用系统返回键（或滑动返回）离开也算，能力 then 的效果照常运行，跳转不再发生",
    ref: "调用能力；迟到的回答；第四批第三波 G3",
    design: {
      screens: [HOME, NEXT, OTHER],
      vars: [words("got", "")],
      parts: [btn("open", "Open", goTo("next")), btn("pay", "Pay", stay(invoke("payment.pay", { args: { orderId: "'o1'" }, ok: body("other", setVar("got", "", "result.status")) })), { screen: "next" })],
    },
    hold: ["payment.pay"],
    steps: [{ tap: "Open" }, { tap: "Pay" }, { platformBack: true }, { answer: "payment.pay", body: { status: "submitted" } }],
    expect: { vars: { got: "submitted" }, screen: "home" },
  },
  {
    id: "invoke-late-restart",
    title: "重新开始后到达的能力结果什么都不做",
    ref: "调用能力；迟到的回答",
    design: { screens: [HOME], vars: [words("got", "")], parts: [btn("pay", "Pay", stay(invoke("payment.pay", { args: { orderId: "'o1'" }, ok: body("none", setVar("got", "", "result.status")) })))] },
    hold: ["payment.pay"],
    steps: [{ tap: "Pay" }, { restart: true }, { answer: "payment.pay", body: { status: "submitted" } }],
    expect: { vars: { got: "" } },
    known: { webPrototype: WEB_PROTO_NO_RESTART },
  },

  /* ---------- where a tap goes ---------- */
  {
    id: "go-and-back",
    title: "打开一屏，再返回",
    ref: "跳转",
    design: { screens: [HOME, NEXT], parts: [btn("go", "Forward", goTo("next")), btn("back", "Backward", goTo("back"), { screen: "next" })] },
    steps: [{ tap: "Forward" }, { tap: "Backward" }],
    expect: { screen: "home" },
  },
  {
    id: "overlay-back-closes",
    title: "叠在上面的屏幕：返回先关它",
    ref: "跳转",
    design: { screens: [HOME, { id: "sheet", name: "Sheet" }], parts: [btn("go", "Lay over", { ...goTo("sheet"), overlay: true }), btn("back", "Dismiss", goTo("back"), { screen: "sheet" })] },
    steps: [{ tap: "Lay over" }, { tap: "Dismiss" }],
    expect: { screen: "home", shown: { Dismiss: false, "Lay over": true } },
  },
  {
    id: "back-own-motion",
    title: "返回带自己的动画：按它倒放，不按来时的",
    ref: "跳转；第四批第一波遗留（Host.back 的 motion）",
    design: {
      screens: [HOME, NEXT],
      parts: [btn("go", "Push in", { ...goTo("next"), motion: { kind: "push", dir: "left" } }), btn("back", "Fade back", { ...goTo("back"), motion: { kind: "dissolve", ms: 200 } }, { screen: "next" })],
    },
    steps: [{ tap: "Push in" }, { tap: "Fade back" }],
    expect: { screen: "home", move: { back: true, motion: "dissolve" } },
  },
];
