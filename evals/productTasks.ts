/* The product-layer tasks: an owner who writes no code describes what the app should do, and the agent makes the
 * contract (models, endpoints, sign-in, realtime), binds the screens to it (data, lists, forms, taps with params,
 * guards), designs the states and fills the mocks. Graded on the document (productGraders.ts), on the preview answering
 * with mock data under each scenario, and on the exported product type-checking (evals/product.ts). */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appMessage } from "../lib/bindings/messages";
import { regionDesigns } from "../lib/core/ops/bindings";
import type { MockOpRule } from "../lib/mocks/types";
import { frameOfPart, REGION_STATES, type Group } from "../lib/tokens";
import { custom, finished, inBudget, language, newScreen, undoOne, type Graded } from "./graders";
import {
  apiValid,
  bindingsResolve,
  bodyField,
  sendsTo,
  channelScripted,
  detailBound,
  endpointLike,
  formBound,
  listBound,
  mocksFilled,
  modelWith,
  previewShows,
  productCompiles,
  scenarioShows,
  screenAuth,
  signInWorks,
  statesDesigned,
  tapPassesParams,
} from "./productGraders";
import type { Budget, Check, EvalTask } from "./types";

const MIN = 60_000;
const PRODUCT: Budget = { steps: 30, tokens: 3_000_000, ms: 15 * MIN, drawings: 0 };
const APP: Budget = { steps: 40, tokens: 4_000_000, ms: 20 * MIN, drawings: 0 };

const basics = (): Check[] => [finished(), undoOne(), inBudget()];

const OPENAPI = readFileSync(join(new URL(".", import.meta.url).pathname, "fixtures", "shop-backend.openapi.yaml"), "utf8");

/** a scenario's rule for the product list: the one for listProducts, else the one for every operation */
const ruleFor = (s: { all?: MockOpRule; ops?: Record<string, MockOpRule> }, op = "listProducts"): MockOpRule | undefined => s.ops?.[op] ?? s.all;
const stepsOf = (r: MockOpRule | undefined): MockOpRule[] => (r ? [r, ...(r.sequence ?? [])] : []);

/** the texts of a region's design for a state, on a screen */
function designWords(g: Graded, screen: string, state: (typeof REGION_STATES)[number]): string[] {
  const f = g.doc.frames.find((x) => x.id === screen);
  if (!f) return [];
  const regions = g.doc.groups.filter((x) => x.states && frameOfPart(x, g.doc.groups, g.doc.frames, g.o.widths)?.id === f.id);
  const words: string[] = [];
  for (const r of regions) {
    const designs = regionDesigns(g.doc.groups, r)[state] ?? [];
    const visit = (x: Group, depth = 0) => {
      if (depth > 12) return;
      for (const it of x.items) for (const k of ["text", "label", "title"]) if (typeof it.props?.[k] === "string") words.push(it.props[k] as string);
      for (const c of g.doc.groups) if (c.inFlow === x.id) visit(c, depth + 1);
    };
    designs.forEach((d) => visit(d));
  }
  return words;
}

export const PRODUCT_TASKS: EvalTask[] = [
  {
    id: "shop-api-wire",
    ability: "product",
    title: "A designed shop list made real: infer models and endpoints, wire the list, fill the mocks",
    lang: "en",
    fixture: "shop-design-en",
    request:
      "Make the Products screen real: work out the API it needs (products with a name, a short description, a price and a picture), create it, connect the list to it and fill the mock data so the list shows real-looking products. Keep my row design.",
    budget: PRODUCT,
    checks: [
      ...basics(),
      apiValid(),
      modelWith("model", "a product model with name and price", [/^name$|title/i, /price|amount/i], { critical: true }),
      endpointLike("list-endpoint", "a GET list endpoint", { method: "get", list: true }, { critical: true }),
      listBound("products", { critical: true }),
      statesDesigned("products"),
      bindingsResolve(),
      mocksFilled(),
      previewShows("products", { min: 3, critical: true }),
      custom("design-kept", "the designed row is the repeated one (one row design, its picture bound)", (g) => {
        const imgs = g.doc.groups.flatMap((x) => x.items).filter((it) => it.component === "image" && Object.values(it.bind ?? {}).some((v) => /item\./.test(String(v))));
        const left = g.doc.groups.filter((x) => x.items.some((it) => it.id.startsWith("row-2"))).length;
        return { pass: imgs.length >= 1 && left === 0, detail: `${imgs.length} bound pictures; ${left ? "the second sample row is still there" : "no sample row left over"}` };
      }),
      productCompiles(),
    ],
  },
  {
    id: "create-form",
    ability: "product",
    title: "A create form bound to a new POST endpoint, with validation and the server's errors",
    lang: "en",
    fixture: "shop-wired-en",
    request:
      "On the New product screen, add a form that creates a product through the API: name (required, 2 to 60 characters), price (required, not negative) and an optional description. Check the fields before sending, show the server's errors next to the fields, and go back to the product list after saving.",
    budget: PRODUCT,
    checks: [
      ...basics(),
      apiValid(),
      endpointLike("create-endpoint", "POST /products with a body", { method: "post", path: /^\/products\/?$/, body: true }, { critical: true }),
      formBound("new-product", { m: { method: "post", path: /^\/products\/?$/ }, fields: [/^name$/i, /^price$/i, /desc/i], critical: true }),
      custom(
        "rules",
        "the body's schema holds the rules: name required 2–60, price required ≥ 0",
        (g) => {
          const m = { method: "post", path: /^\/products\/?$/ };
          const name = bodyField(g, m, /^name$/i);
          const price = bodyField(g, m, /^price$/i);
          const n = name.schema ?? {};
          const p = price.schema ?? {};
          const pass = name.required && n.minLength === 2 && n.maxLength === 60 && price.required && (p.minimum === 0 || p.exclusiveMinimum === -1 || (typeof p.minimum === "number" && p.minimum <= 0.01 && p.minimum >= 0));
          return { pass: !!pass, detail: `name ${name.required ? "required" : "optional"} ${n.minLength ?? "-"}–${n.maxLength ?? "-"}; price ${price.required ? "required" : "optional"} min ${p.minimum ?? p.exclusiveMinimum ?? "-"}` };
        },
        { critical: true },
      ),
      custom("then", "after saving it goes back to the product list", (g) => {
        const form = g.doc.groups.find((x) => x.form?.then && frameOfPart(x, g.doc.groups, g.doc.frames, g.o.widths)?.id === "new-product");
        const to = form?.form?.then?.to;
        return { pass: to === "products" || to === "back", detail: form ? `then → ${to ?? "nowhere"}` : "no form with a then" };
      }),
      custom("errors-shown", "the server's errors show on the fields and the form", (g) => {
        const binds = g.doc.groups.flatMap((x) => x.items).flatMap((it) => Object.values(it.bind ?? {}).map(String));
        const field = binds.some((b) => /form\.errors\./.test(b));
        const form = binds.some((b) => /form\.error\b/.test(b)) || g.doc.groups.some((x) => x.showWhen && "expr" in x.showWhen && /form\.error\b/.test(x.showWhen.expr));
        return { pass: field && form, detail: `${field ? "field errors bound" : "no field shows its error"}; ${form ? "a form error line" : "no form error line"}` };
      }),
      bindingsResolve(),
      productCompiles(),
    ],
  },
  {
    id: "detail-params",
    ability: "product",
    title: "A detail screen opened from a list tap with the row's id as its params",
    lang: "en",
    fixture: "shop-wired-en",
    request: "Tapping a product in the list should open the Product screen and show that product's picture, name, price and description from the API.",
    budget: PRODUCT,
    checks: [
      ...basics(),
      apiValid(),
      tapPassesParams("products", "product", { critical: true }),
      detailBound("product", { m: { method: "get", list: false }, fields: [/\.name\b/, /\.price\b/], critical: true }),
      statesDesigned("product"),
      bindingsResolve(),
      previewShows("product", { critical: true }),
      productCompiles(),
    ],
  },
  {
    id: "login-guard",
    ability: "product",
    title: "Sign-in: a login endpoint and screen, bearer auth, and the orders screen behind it",
    lang: "en",
    fixture: "orders-en",
    request: "Add sign-in: a Login screen with email and password that signs in through the API (bearer token), and make the Orders screen available only to signed-in users.",
    budget: PRODUCT,
    checks: [
      ...basics(),
      apiValid(),
      endpointLike("login-endpoint", "a public POST sign-in endpoint", { method: "post", body: true, public: true }, { critical: true }),
      custom(
        "auth",
        "the API signs in with a bearer token and the orders need it",
        (g) => {
          const auth = g.doc.api?.auth;
          const bearer = Object.values(auth?.schemes ?? {}).some((s) => s && typeof s === "object" && (s as { scheme?: string }).scheme?.toLowerCase() === "bearer");
          const orders = g.doc.api?.endpoints?.find((e) => e.operationId === "listOrders");
          const guarded = orders ? (orders.security ? orders.security.length > 0 : !!auth?.security?.length) : false;
          return { pass: !!auth?.login && bearer && guarded, detail: `login ${auth?.login ?? "unset"}, ${bearer ? "bearer" : "no bearer scheme"}, listOrders ${guarded ? "needs a token" : "is public"}` };
        },
        { critical: true },
      ),
      screenAuth(/log ?in|sign ?in/i, "login", { critical: true }),
      formBound(/log ?in|sign ?in/i, { m: { method: "post" }, fields: [/email|user/i, /password/i], critical: true }),
      screenAuth("orders", "required", { critical: true }),
      signInWorks(),
      bindingsResolve(),
      productCompiles(),
    ],
  },
  {
    id: "import-openapi",
    ability: "product",
    title: "Import the back end's OpenAPI file and wire two list screens to it",
    lang: "en",
    fixture: "two-screens-en",
    request: `Here is our back end's OpenAPI file. Import it and wire the Products and My orders screens to it so they show their lists.\n\n\`\`\`yaml\n${OPENAPI}\`\`\``,
    budget: PRODUCT,
    checks: [
      ...basics(),
      apiValid(),
      endpointLike("imported", "the file's endpoints are in (listProducts, listOrders, login)", { method: "get", path: /^\/orders$/ }, { critical: true }),
      custom("all-imported", "every operation of the file was imported", (g) => {
        const want = ["login", "refreshToken", "logout", "listProducts", "createProduct", "getProduct", "updateProduct", "deleteProduct", "uploadProductImage", "listOrders", "getMe"];
        const have = new Set((g.doc.api?.endpoints ?? []).map((e) => e.operationId));
        const missing = want.filter((x) => !have.has(x));
        return { pass: !missing.length, detail: missing.length ? `missing ${missing.join(", ")}` : `${have.size} operations` };
      }),
      listBound("products", { m: { path: /^\/products$/ }, critical: true }),
      listBound("orders", { m: { path: /^\/orders$/ }, critical: true, id: "orders-bound" }),
      statesDesigned(/./),
      bindingsResolve(),
      previewShows("products", { min: 3 }),
      previewShows("orders", { min: 1, id: "preview-orders" }),
      productCompiles(),
    ],
  },
  {
    id: "scenarios-states",
    ability: "product",
    title: "Mock scenarios (empty, server error, slow) and the list's states in the shop's words",
    lang: "en",
    fixture: "shop-wired-en",
    request:
      "Add three mock scenarios for testing: an empty shop, a server error (500) and a slow network (about 3 seconds per answer). Then design the product list's empty and error states in the shop's own words — e.g. “No products yet” — instead of the generic text.",
    budget: PRODUCT,
    checks: [
      ...basics(),
      scenarioShows("scenario-empty", "an empty-shop scenario shows the list empty", (s) => stepsOf(ruleFor(s)).some((r) => r.empty) || s.counts?.Product === 0 || s.counts?.["*"] === 0, "products", ["empty"], { critical: true }),
      scenarioShows("scenario-error", "a server-error scenario shows the list's error", (s) => stepsOf(ruleFor(s)).some((r) => (r.status ?? 0) >= 500) || s.errorRate === 1, "products", ["error"], { critical: true }),
      scenarioShows("scenario-slow", "a slow-network scenario (2 s or more)", (s) => (s.latency?.min ?? 0) >= 2000 || stepsOf(ruleFor(s)).some((r) => (r.latencyMs ?? 0) >= 2000), "products", [], { critical: true }),
      custom(
        "state-words",
        "the empty and error designs say it in the shop's words",
        (g) => {
          const generic = new Set(["emptyTitle", "emptyDetail", "errorTitle", "errorDetail", "refresh", "retry"].map((k) => appMessage(k as never, "en")));
          const empty = designWords(g, "products", "empty");
          const error = designWords(g, "products", "error");
          const own = (ws: string[]) => ws.filter((w) => !generic.has(w));
          const pass = own(empty).length > 0 && own(error).length > 0 && empty.some((w) => /product|shop|stock|item/i.test(w));
          return { pass, detail: `empty: ${empty.join(" / ") || "none"}; error: ${error.join(" / ") || "none"}` };
        },
        { critical: true },
      ),
      statesDesigned("products"),
      bindingsResolve(),
      productCompiles(),
    ],
  },
  {
    id: "chat-realtime",
    ability: "product",
    title: "A chat bound to the API: messages listed, sent with a call, pushed over a WebSocket, a mock reply script",
    lang: "en",
    fixture: "chat-design-en",
    request:
      "Make this chat work with the API: load the conversation's messages from the server, push new messages in real time over a WebSocket, and post a message when I tap send. Add a mock script so a reply arrives a moment after I send one.",
    budget: PRODUCT,
    checks: [
      ...basics(),
      apiValid(),
      modelWith("model", "a message model with its words and author", [/text|body|content|message/i, /author|sender|user|from/i], { critical: true }),
      endpointLike("post", "a POST that sends a message", { method: "post", body: true }, { critical: true }),
      channelScripted({ critical: true }),
      custom("reply-script", "the mock script replies after the app sends", (g) => {
        const s = (g.doc.mocks?.realtime ?? []).filter((x) => x.trigger && (x.trigger.on === "message" || x.trigger.on === "call"));
        return { pass: s.length > 0, detail: (g.doc.mocks?.realtime ?? []).map((x) => `${x.id}: ${x.trigger ? x.trigger.on : "connect"} → ${x.steps.length} steps`).join("; ") || "no scripts" };
      }),
      listBound("chat", { critical: true }),
      sendsTo("chat", { method: "post" }, { critical: true }),
      bindingsResolve(),
      previewShows("chat", { min: 1 }),
      productCompiles(),
    ],
  },
  {
    id: "ledger-app-zh",
    ability: "product",
    title: "A whole small app asked for in Chinese: three screens, contract, bindings, mocks",
    lang: "zh",
    fixture: "blank-zh",
    request:
      "帮我做一个记账小应用，三个页面：账单列表、记一笔（表单）、账单详情。要有完整的接口（账单的数据模型，列表、详情、新建），页面都绑定好接口，列表点一条打开详情，记一笔提交后回到列表；再填好模拟数据，让列表能看到账单。",
    budget: APP,
    checks: [
      ...basics(),
      newScreen({ min: 2 }),
      custom("three-screens", "at least three screens", (g) => ({ pass: g.doc.frames.length >= 3, detail: g.doc.frames.map((f) => f.name).join(", ") }), { critical: true }),
      apiValid(),
      modelWith("model", "a bill model with an amount", [/amount|money|sum|price|total/i], { critical: true }),
      endpointLike("list-endpoint", "a GET list endpoint", { method: "get", list: true }, { critical: true }),
      endpointLike("get-endpoint", "a GET one endpoint", { method: "get", list: false, path: /\{[^}]+\}$/ }),
      endpointLike("create-endpoint", "a POST create endpoint", { method: "post", body: true }, { critical: true }),
      listBound(/./, { critical: true }),
      tapPassesParams(/./, /./, { critical: true }),
      formBound(/./, { m: { method: "post" }, fields: [/amount|money|sum|price|total/i], critical: true }),
      statesDesigned(/./),
      bindingsResolve(),
      mocksFilled(),
      previewShows(/./, { min: 3, critical: true }),
      language(),
      productCompiles(),
    ],
  },
];
