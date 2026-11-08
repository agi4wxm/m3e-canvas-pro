/* The consistency table: each row a small design, what a visitor does to it, and what every host must end up with
 * (docs/交互规则.md says why). The interpreter (lib/actions) passes every row; a host that does not is listed under the
 * row's `known`, with why, until it runs on the interpreter. To add a row: write it here, run `bun run test` (the
 * interpreter, the preview and both web hosts), `bun run gen:rn` and `bun run gen:miniapp` (they write the table into
 * the kits' test beds), then the kits' own tests; list a host under `known` only with its reason. */

import type { Action, ActionBody, Effect } from "../model";
import type { Design, PartSpec, Row } from "./types";

const HOME = { id: "home", name: "Home" };
const NEXT = { id: "next", name: "Next" };
const DONE = { id: "done", name: "Done" };
const OTHER = { id: "other", name: "Other" };

/** a tap that stays where it is and runs these effects */
const stay = (...effects: Effect[]): Action => ({ to: "none", transition: "none", effects });
const goTo = (to: string, ...effects: Effect[]): Action => ({ to, transition: "none", effects });
const body = (to: string, ...effects: Effect[]): ActionBody => ({ to, transition: "none", effects });
const btn = (id: string, label: string, action: Action, more: Partial<PartSpec> = {}): PartSpec => ({ id, label, action, ...more });
const text = (id: string, label: string, more: Partial<PartSpec> = {}): PartSpec => ({ id, kind: "text", label, ...more });
/** a call; `ok` is its `then`, `fail` its `catch` */
function call(operationId: string, more: { args?: Record<string, string>; ok?: ActionBody; fail?: ActionBody } = {}): Effect {
  const { ok, fail, ...rest } = more;
  // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
  return { do: "call", operationId, ...rest, ...(ok ? { then: ok } : {}), ...(fail ? { catch: fail } : {}) };
}
const toast = (message: string): Effect => ({ do: "snackbar", message });
const setVar = (v: string, value: string | number | boolean, expr?: string): Effect => ({ do: "setVar", var: v, value, ...(expr ? { expr } : {}) });
const num = (id: string, value: number) => ({ id, name: id, type: "number" as const, value });
const words = (id: string, value: string) => ({ id, name: id, type: "text" as const, value });
const bool = (id: string, value: boolean) => ({ id, name: id, type: "bool" as const, value });
const op = (operationId: string, more: Partial<Design["api"] extends (infer O)[] | undefined ? O : never> = {}) => ({ operationId, path: `/${operationId}`, ...more });

/* reasons the hosts share, with the report's sections */
const WEB_PROTO_NO_API = "原型 Web 导出没有接口：调用、刷新、提交、退出登录整个丢掉，也不报告（报告 6.2、9.4）";
const RENDER_SCOPE = "接口参数读的是屏幕渲染时的作用域，看不到同一次点击里前面效果写入的值（报告 6.2：Web `printBindings.ts`、手机端 `mobile.ts`、小程序 `env.$`）";
const NO_LATEST = "lib/app 的 Runtime.call 只在重新开始后丢弃回答，同一组件同一接口的旧回答照样运行（报告 7.2，整改计划第一批遗留）";
const NAV_AFTER_MOVE = "回答到达时访客已经离开，lib/app 宿主仍执行 then/catch 里的跳转，把访客拽走（报告 7.1、7.2）";
const PREVIEW_DROPS = "预览在访客离开后整个丢弃 then/catch（第一批 W5 的规则），效果也不再运行，状态跟不上后端（报告 7.1）";

export const ROWS: Row[] = [
  /* ---------- order ---------- */
  {
    id: "order-setvar-then-call",
    title: "先设变量再调用：接口参数读到新值",
    ref: "顺序；报告 6.2、6.3",
    design: { screens: [HOME], vars: [num("qty", 1)], api: [op("create", { body: { qty: { title: "Qty", type: "number" } } })], parts: [btn("go", "Order five", stay(setVar("qty", 5), call("create", { args: { qty: "vars.qty" } })))] },
    steps: [{ tap: "Order five" }],
    expect: { vars: { qty: 5 }, calls: [{ op: "create", in: { qty: 5 } }] },
    known: { webPrototype: WEB_PROTO_NO_API, webProduct: RENDER_SCOPE, rn: RENDER_SCOPE, miniapp: RENDER_SCOPE },
  },
  {
    id: "order-call-then-setvar",
    title: "先调用再设变量：接口参数读到旧值",
    ref: "顺序；报告 6.2",
    design: { screens: [HOME], vars: [num("qty", 1)], api: [op("create", { body: { qty: { title: "Qty", type: "number" } } })], parts: [btn("go", "Order then set", stay(call("create", { args: { qty: "vars.qty" } }), setVar("qty", 5)))] },
    steps: [{ tap: "Order then set" }],
    expect: { vars: { qty: 5 }, calls: [{ op: "create", in: { qty: 1 } }] },
    known: { preview: "预览先整批执行本地效果、再发出接口调用，调用读到后面才写的值（报告 6.2：`Preview.tsx` runBody）", webPrototype: WEB_PROTO_NO_API },
  },
  {
    id: "order-local-reads-previous",
    title: "后一个效果读前一个效果写入的值",
    ref: "顺序；报告 6.3",
    design: { screens: [HOME], vars: [num("n", 1), num("m", 0)], parts: [btn("go", "Count", stay({ do: "addVar", var: "n", by: 1 }, setVar("m", 0, "vars.n * 10")))] },
    steps: [{ tap: "Count" }],
    expect: { vars: { n: 2, m: 20 } },
    known: {
      webPrototype: "原型 Web 导出忽略“设为变量”的表达式，不报告（报告 6.2：`printBehaviour.ts` setVar）",
      webProduct: "产品 Web 的“设为变量”表达式读屏幕渲染时的作用域（`$`），读不到同一次点击里前面效果写入的值（报告 6.2）",
      miniapp: "小程序的“设为变量”表达式读屏幕渲染时的作用域（`env.$`），读不到同一次点击里前面效果写入的值（报告 6.2）",
    },
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
      webProduct: "产品 Web 的跳转参数读屏幕渲染时的作用域，读不到同一次点击里写入的值（报告 6.3：跳转参数在所有效果之后读）",
      rn: "手机端：没有接口的设计不打印屏幕参数和跳转参数（`lib/export/rn/print.ts` 只在 `doc.api` 存在时打印绑定）",
      miniapp: "小程序的跳转参数读屏幕渲染时的作用域（`env.$`），读不到同一次点击里写入的值（报告 6.3）",
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
    design: { screens: [HOME], vars: [bool("flag", false), words("r", "")], parts: [btn("go", "Decide", { ...stay(setVar("r", "yes")), when: { var: "flag", op: "eq", value: true }, else: body("none", setVar("r", "no")) })] },
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
    known: {
      rn: "手机端把“关闭”当成隐藏整个部件，下拉菜单连触发按钮一起消失（报告 6.2：`rn/src/kit/app.tsx`）",
      miniapp: "小程序把“关闭”当成隐藏整个部件，下拉菜单连触发按钮一起消失（`miniapp-kit/src/kit/app/screen.tsx` close）",
    },
  },
  {
    id: "open-menu",
    title: "打开菜单：菜单项出现",
    ref: "打开与关闭",
    design: { screens: [HOME], parts: [{ id: "menu", kind: "menu", label: "Choices", items: ["Duplicate"] }, btn("open", "Show choices", stay({ do: "open", part: "menu" }))] },
    steps: [{ tap: "Show choices" }],
    expect: { shown: { Choices: true, Duplicate: true } },
    known: {
      rn: "手机端的“打开”只让部件出现，不打开菜单的弹出层（套件的 Menu 自己管开合，不读 opened）",
      miniapp: "小程序的“打开”只让部件出现，不打开菜单的弹出层（套件的 Menu 自己管开合，不读 opened）",
    },
  },

  /* ---------- variables, props, words ---------- */
  {
    id: "setvar-expr",
    title: "设为变量可以用表达式取值",
    ref: "变量；报告 6.2",
    design: { screens: [HOME], vars: [num("a", 2), num("b", 3), num("total", 0)], parts: [btn("go", "Add up", stay(setVar("total", 0, "vars.a + vars.b")))] },
    steps: [{ tap: "Add up" }],
    expect: { vars: { total: 5 } },
    known: { webPrototype: "原型 Web 导出忽略“设为变量”的表达式，写入的是面板上的值，不报告（报告 6.2：`printBehaviour.ts` setVar）" },
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
    known: { webPrototype: "原型 Web 导出的提示条不读 {{表达式}}，原样显示（只有产品 Web 读绑定）" },
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
    known: { webPrototype: WEB_PROTO_NO_API, webProduct: RENDER_SCOPE, miniapp: RENDER_SCOPE },
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
      preview: "预览嵌套到第 6 层（`Preview.tsx` depth > 6），比读文件的 4 层多（报告 6.2）",
      webPrototype: WEB_PROTO_NO_API,
      webProduct: "产品 Web 不限层数（报告 6.2）",
      rn: "手机端打印到第 6 层（`rn/print.ts` depth > 6）（报告 6.2）",
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
    known: { webPrototype: WEB_PROTO_NO_API, webProduct: NO_LATEST, rn: NO_LATEST, miniapp: NO_LATEST },
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
    known: { preview: PREVIEW_DROPS, webPrototype: WEB_PROTO_NO_API, webProduct: NAV_AFTER_MOVE, rn: NAV_AFTER_MOVE, miniapp: NAV_AFTER_MOVE },
  },
  {
    id: "late-moved-catch",
    title: "访客已离开：catch 的提示条照常出现",
    ref: "迟到的回答",
    design: { screens: [HOME, OTHER], api: [op("save")], parts: [btn("go", "Save badly", stay(call("save", { fail: body("none", toast("Could not save")) }))), btn("leave", "Leave", goTo("other"))] },
    hold: ["save"],
    steps: [{ tap: "Save badly" }, { tap: "Leave" }, { answer: "save", status: 500 }],
    expect: { toast: "Could not save", screen: "other" },
    known: { preview: PREVIEW_DROPS, webPrototype: WEB_PROTO_NO_API },
  },

  /* ---------- forms ---------- */
  {
    id: "form-submit",
    title: "提交表单：请求体是输入框的内容，成功后运行表单的 then",
    ref: "表单",
    design: { screens: [HOME], api: [op("note", { body: { text: { title: "Note", required: true } } })], forms: [{ operationId: "note", submit: "Save note", ok: body("none", toast("Saved {{form.values.text}}")) }], parts: [] },
    steps: [{ type: "Note", value: "hi" }, { tap: "Save note" }],
    expect: { toast: "Saved hi", calls: [{ op: "note", in: { text: "hi" } }] },
    known: { webPrototype: WEB_PROTO_NO_API, rn: "手机端表单的 then 和 catch 读屏幕的作用域，里面没有 form：`form.values.*` 读不到（`mobile.ts` 的 useFormFor）" },
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
      preview: "预览只在进入屏幕时检查登录，退出登录后仍停在需要登录的屏幕上（报告 6.2）",
      webPrototype: WEB_PROTO_NO_API,
      webProduct: "产品 Web 只在进入屏幕时检查登录，退出登录后仍停在需要登录的屏幕上（报告 6.2）",
    },
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
];
