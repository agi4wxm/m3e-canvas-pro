/* Operations that bind the screens to the contract (lib/bindings, docs/数据绑定.md): the data a screen loads, the
 * params it is opened with and whether it needs a session, props bound to expressions, regions that show a state of
 * their data (loading, empty, error, forbidden) with a design for each, forms for an endpoint's body, inputs bound to
 * its fields, and `wire_screen`, which sets all of it up for a screen and an endpoint in one step. Each is one undo
 * step, and through OPS a tool of the in-app AI and of MCP. */

import { partBySlug } from "../../../parts/registry";
import type { ApiSpec, JsonSchema, JsonSchemaObject } from "../../api/types";
import { BINDING_NAME } from "../../bindings/clean";
import { exprPlaceError, exprSyntaxError } from "../../bindings/check";
import { shapeFor, type ScopeShape } from "../../bindings/complete";
import { endpointOf, formFields, listOf, paramsOf, resolved, responseSchema, titleOf, type FieldSpec } from "../../bindings/contract";
import { appMessage } from "../../bindings/messages";
import { INPUT_PROP } from "../../interact";
import { contentWidth, frameOfPart, frameSizeOf, heldBy, REGION_STATES, STAY_TARGET, type Action, type ActionBody, type DataSource, type FormBinding, type Frame, type Group, type Item, type RegionState, type ScreenParam } from "../../tokens";
import { op, OpError, S, type OpCtx } from "../op";
import { withFrames, withGroups, withSession, type CoreState } from "../state";
import { frameById, groupById, itemById, laidOut, unlocked } from "./common";
import { addKit, buildKit, setItem } from "./nodes";
import { addTree, type TreeNode } from "./tree";
import { actionError, FIELD_PATH, fullAction } from "./validate";
import { mapFrameExprs, mapGroupExprs, namesMap, renamedName } from "../../refs";

/* ---------- finding ---------- */

/** the screen a group stands on */
const screenOf = (s: CoreState, g: Group, ctx: OpCtx) => frameOfPart(g, s.doc.groups, s.doc.frames, ctx.widths);

/** what an expression written on a group can read */
const shapeAt = (s: CoreState, g: Group, ctx: OpCtx): ScopeShape => shapeFor(s.doc, screenOf(s, g, ctx), g.id, ctx.widths);

function checkExpr(v: unknown, shape: ScopeShape, where: string) {
  const e = exprPlaceError(v, shape);
  if (e) throw new OpError("invalid_value", `${where}: ${e}.`, where);
}

function endpoint(s: CoreState, operationId: string) {
  const api = s.doc.api ?? {};
  const e = endpointOf(api, operationId);
  if (!e) {
    const all = (api.endpoints ?? []).map((x) => x.operationId);
    throw new OpError("not_found", `There is no endpoint ${JSON.stringify(operationId)}.${all.length ? ` The endpoints are: ${all.slice(0, 20).join(", ")}.` : " add_endpoint adds one (or import_openapi)."}`, operationId);
  }
  return { api, e };
}

const withFrame = (s: CoreState, f: Frame) => withFrames(s, s.doc.frames.map((x) => (x.id === f.id ? f : x)));
const withGroup = (s: CoreState, g: Group) => withGroups(s, s.doc.groups.map((x) => (x.id === g.id ? g : x)));

/** a frame with a field set, or taken away when it is nothing */
function framePatch<K extends keyof Frame>(f: Frame, key: K, v: Frame[K] | undefined): Frame {
  const { [key]: _was, ...rest } = f;
  return (v === undefined || (Array.isArray(v) && !v.length) ? rest : { ...rest, [key]: v }) as Frame;
}

function groupPatch<K extends keyof Group>(g: Group, key: K, v: Group[K] | undefined): Group {
  const { [key]: _was, ...rest } = g;
  return (v === undefined ? rest : { ...rest, [key]: v }) as Group;
}

/** the name a source of an endpoint is called by default: listProducts → products, getProduct → product */
export function sourceNameFor(operationId: string, taken: string[] = []): string {
  const bare = operationId.replace(/^(list|get|fetch|search|find|load|read|query|all)(?=[A-Z])/, "");
  let base = bare ? bare[0].toLowerCase() + bare.slice(1) : operationId;
  if (!BINDING_NAME.test(base)) base = "data";
  let name = base;
  for (let i = 2; taken.includes(name); i++) name = `${base}${i}`;
  return name;
}

/** what the screen of a data source loads, checked: the endpoint, params it takes, paging only where it pages */
function checkedSource(s: CoreState, f: Frame, d: DataSource, strict: boolean) {
  const { api, e } = endpoint(s, d.operationId);
  if (!BINDING_NAME.test(d.name)) throw new OpError("invalid_value", `${JSON.stringify(d.name)} is no name for data: a letter, then letters, digits or _ (it is read as data.${d.name}).`, d.name);
  const takes = paramsOf(api, e).map((p) => p.name);
  const shape = shapeFor(s.doc, f, undefined);
  for (const [k, x] of Object.entries(d.params ?? {})) {
    if (strict && !takes.includes(k)) throw new OpError("invalid_value", `${d.operationId} takes no param ${JSON.stringify(k)}${takes.length ? ` (it takes ${takes.join(", ")})` : ""}.`, k);
    if (strict) checkExpr(x, shape, `params.${k}`);
    else if (exprSyntaxError(x)) throw new OpError("invalid_value", `params.${k}: ${exprSyntaxError(x)}.`, k);
  }
  if (d.body !== undefined) checkExpr(d.body, shape, "body");
  if (d.paging && !e.pagination && strict) throw new OpError("invalid_value", `${d.operationId} has no pagination (update_endpoint sets it), so it loads no pages.`, "paging");
}

/** the path params of an endpoint a source gives nothing for, read from the screen's params of the same names (declared
 *  where the screen lacks them) */
function withPathParams(s: CoreState, f: Frame, d: DataSource): { frame: Frame; source: DataSource; added: string[] } {
  const { api, e } = endpoint(s, d.operationId);
  const missing = paramsOf(api, e).filter((p) => p.in === "path" && !(d.params && p.name in d.params));
  /* a param given as the screen's own (params.productId) is one the screen takes, declared like the path's */
  const read = Object.values(d.params ?? {}).flatMap((x) => /^\s*params\.([A-Za-z_]\w*)\s*$/.exec(String(x))?.[1] ?? []);
  if (!missing.length && !read.length) return { frame: f, source: d, added: [] };
  const have = new Set((f.params ?? []).map((p) => p.name));
  const added = [...new Set([...missing.map((p) => p.name), ...read])].filter((n) => !have.has(n) && BINDING_NAME.test(n));
  const params: ScreenParam[] = [...(f.params ?? []), ...added.map((name) => ({ name }))];
  return { frame: { ...f, params }, source: { ...d, params: { ...d.params, ...Object.fromEntries(missing.filter((p) => BINDING_NAME.test(p.name)).map((p) => [p.name, `params.${p.name}`])) } }, added };
}

/* ---------- data sources ---------- */

const SOURCE_ARGS = {
  params: S.any("the endpoint's path, query and header params by name, each an expression (\"params.productId\", \"vars.search\", \"20\"); a path param left out reads the screen's param of the same name"),
  body: S.str("the request body as an expression, for an endpoint that reads with POST"),
  load: S.enum(["enter", "demand"], "when it loads: as the screen is entered (default), or when a tap asks (refresh)"),
  pullToRefresh: S.bool("a pull on the screen loads it again"),
  paging: S.enum(["scroll", "button"], "for a paged endpoint: the next page at the end of scrolling, or by a tap with loadMore"),
  pageSize: S.int("the page size asked for", { minimum: 1, maximum: 500 }),
};

type SourceArgs = Omit<DataSource, "name" | "operationId">;

export const addDataSource = op<{ screen: string; operationId: string; name?: string } & SourceArgs, { name: string; addedParams: string[] }>({
  name: "add_data_source",
  summary:
    "Makes a screen load data from an endpoint: read as data.<name> (value, items, status, loading, error, hasMore, empty). Params are expressions; a path param left out reads the screen's param of the same name, and a screen param read as params.<name> is declared on the screen when missing. Loads on enter unless load: demand.",
  args: S.obj({ screen: S.str(), operationId: S.str(), name: S.str("what expressions call it (default from the operationId: listProducts → products)"), ...SOURCE_ARGS }, ["screen", "operationId"]),
  label: () => "Add data source",
  run(s, a, ctx) {
    const f = frameById(s, a.screen);
    const taken = (f.data ?? []).map((d) => d.name);
    const name = a.name ?? sourceNameFor(a.operationId, taken);
    if (taken.includes(name)) throw new OpError("invalid_value", `The screen loads data called ${JSON.stringify(name)} already: update_data_source changes it, or give another name.`, name);
    const given: DataSource = { name, operationId: a.operationId, ...sourceFields(a) };
    const { frame, source, added } = withPathParams(s, f, given);
    checkedSource(withFrame(s, frame), frame, source, ctx.strict);
    const next = { ...frame, data: [...(frame.data ?? []), source] };
    return { state: withFrame(s, next), result: { name, addedParams: added } };
  },
});

/** the optional fields of a source as given, nothing for what is not */
function sourceFields(a: Partial<Record<keyof SourceArgs, unknown>>): SourceArgs {
  return {
    ...(a.params && typeof a.params === "object" && Object.keys(a.params).length ? { params: a.params as Record<string, string> } : {}),
    ...(typeof a.body === "string" ? { body: a.body } : {}),
    ...(a.load === "demand" ? { load: "demand" as const } : {}),
    ...(a.pullToRefresh === true ? { pullToRefresh: true } : {}),
    ...(a.paging === "scroll" || a.paging === "button" ? { paging: a.paging } : {}),
    ...(typeof a.pageSize === "number" ? { pageSize: a.pageSize } : {}),
  };
}

/** What reads a data source of a screen, once it is called `to` instead of `from`: every expression of the parts on
 *  the screen (bound props, conditions, taps, the list a layout repeats over, a form's fields and answers, a region's
 *  test) and of its other data sources, the words with `{{data.<from>…}}` in them (in props and labels, in a snackbar),
 *  and the effects and regions that name it (`refresh`, `loadMore`, an optimistic change, a region's source). The
 *  expressions are read by their tokens (lib/refs.ts), so `'data.<from>'` in a string literal stays as written. */
function renamedSource(s: CoreState, f: Frame, from: string, to: string, ctx: OpCtx): CoreState {
  const m = namesMap(renamedName("data", from, to));
  /* the effects and the region that name the source rather than read it */
  const named = <T>(v: T): T => (Array.isArray(v) ? (v.map(named) as T) : v && typeof v === "object" ? (Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "source" && x === from ? to : named(x)])) as T) : v);
  const groups = s.doc.groups.map((g) => {
    if (screenOf(s, g, ctx)?.id !== f.id) return g;
    const read = mapGroupExprs(g, m);
    const items = read.items.map((it) => ({ ...it, ...(it.action ? { action: named(it.action) } : {}), ...(it.actions ? { actions: named(it.actions) } : {}) }));
    return { ...read, items, ...(read.states?.source === from ? { states: { ...read.states, source: to } } : {}), ...(read.form ? { form: named(read.form) } : {}) };
  });
  return withFrame(withGroups(s, groups), mapFrameExprs(frameById(s, f.id), m));
}

export const updateDataSource = op<{ screen: string; name: string; rename?: string; operationId?: string } & { [K in keyof SourceArgs]?: SourceArgs[K] | null }>({
  name: "update_data_source",
  summary: "Changes a screen's data source: its endpoint, params, body, when it loads, pull to refresh, paging, page size (null clears one), or its name (rename: the screen's expressions follow).",
  args: S.obj(
    {
      screen: S.str(),
      name: S.str(),
      rename: S.str(),
      operationId: S.str(),
      params: { type: ["object", "null"] },
      body: { type: ["string", "null"] },
      load: { type: ["string", "null"], enum: ["enter", "demand", null] },
      pullToRefresh: { type: ["boolean", "null"] },
      paging: { type: ["string", "null"], enum: ["scroll", "button", null] },
      pageSize: { type: ["integer", "null"], minimum: 1, maximum: 500 },
    },
    ["screen", "name"],
  ),
  label: () => "Data source",
  run(s, a, ctx) {
    const f = frameById(s, a.screen);
    const was = (f.data ?? []).find((d) => d.name === a.name);
    if (!was) throw new OpError("not_found", `The screen loads no data called ${JSON.stringify(a.name)}${f.data?.length ? ` (it loads ${f.data.map((d) => d.name).join(", ")})` : ""}.`, a.name);
    const name = a.rename ?? was.name;
    if (a.rename !== undefined && a.rename !== was.name && (f.data ?? []).some((d) => d.name === a.rename)) throw new OpError("invalid_value", `The screen loads data called ${JSON.stringify(a.rename)} already.`, a.rename);
    const merged: Record<string, unknown> = { ...was };
    for (const k of ["params", "body", "load", "pullToRefresh", "paging", "pageSize"] as const) {
      if (a[k] === null) delete merged[k];
      else if (a[k] !== undefined) merged[k] = a[k];
    }
    const next: DataSource = { name, operationId: a.operationId ?? was.operationId, ...sourceFields(merged) };
    checkedSource(s, f, next, ctx.strict);
    let state = withFrame(s, { ...f, data: (f.data ?? []).map((d) => (d.name === was.name ? next : d)) });
    if (name !== was.name) state = renamedSource(state, frameById(state, f.id), was.name, name, ctx);
    return { state };
  },
});

export const removeDataSource = op<{ screen: string; name: string }>({
  name: "remove_data_source",
  summary: "Stops a screen loading a data source; what reads data.<name> reads nothing.",
  args: S.obj({ screen: S.str(), name: S.str() }, ["screen", "name"]),
  label: () => "Remove data source",
  run(s, a) {
    const f = frameById(s, a.screen);
    if (!(f.data ?? []).some((d) => d.name === a.name)) throw new OpError("not_found", `The screen loads no data called ${JSON.stringify(a.name)}.`, a.name);
    return { state: withFrame(s, framePatch(f, "data", (f.data ?? []).filter((d) => d.name !== a.name))) };
  },
});

/* ---------- screens ---------- */

export const setScreenParams = op<{ screen: string; params: ScreenParam[] }>({
  name: "set_screen_params",
  summary: 'Declares what a screen is opened with (navigation passes them: set_action {params: {productId: "item.id"}}): each {name, type?: string|number|boolean, example?}; the screen reads params.<name>, and the canvas and a preview opened straight on it use the example.',
  args: S.obj({ screen: S.str(), params: S.arr(S.obj({ name: S.str(), type: S.enum(["string", "number", "boolean"]), example: S.str() }, ["name"])) }, ["screen", "params"]),
  label: () => "Screen params",
  run(s, a) {
    const f = frameById(s, a.screen);
    const seen = new Set<string>();
    for (const p of a.params) {
      if (!BINDING_NAME.test(p.name)) throw new OpError("invalid_value", `${JSON.stringify(p.name)} is no param name: a letter, then letters, digits or _.`, p.name);
      if (seen.has(p.name)) throw new OpError("invalid_value", `The param ${JSON.stringify(p.name)} is listed twice.`, p.name);
      seen.add(p.name);
    }
    const params = a.params.map((p) => ({ name: p.name, ...(p.type ? { type: p.type } : {}), ...(p.example !== undefined ? { example: String(p.example) } : {}) }));
    return { state: withFrame(s, framePatch(f, "params", params)) };
  },
});

export const setScreenAuth = op<{ screen: string; auth: "required" | "login" | null }>({
  name: "set_screen_auth",
  summary: 'Says a screen needs a session ("required": without one the app goes to the sign-in screen first) or is the sign-in screen ("login": where a 401 and a required screen send the app; one at a time); null for neither.',
  args: S.obj({ screen: S.str(), auth: { type: ["string", "null"], enum: ["required", "login", null] } }, ["screen", "auth"]),
  label: () => "Screen sign-in",
  run(s, a) {
    const f = frameById(s, a.screen);
    let frames = s.doc.frames.map((x) => (x.id === f.id ? framePatch(x, "auth", a.auth ?? undefined) : x));
    /* there is one sign-in screen */
    if (a.auth === "login") frames = frames.map((x) => (x.id !== f.id && x.auth === "login" ? framePatch(x, "auth", undefined) : x));
    return { state: withFrames(s, frames) };
  },
});

/* ---------- props bound to expressions ---------- */

export const bindExpression = op<{ id: string; prop: string; expr: string | null }>({
  name: "bind_expression",
  summary:
    'Binds a prop of a part to an expression, read in the preview and the exported app: data.<source>.value.<field>, item.<field> inside a repeat over data, params.<name>, vars.<name>, form.<field>, auth.user… with helpers such as currency(item.price), relative(item.createdAt), plural(n, "# item", "# items"). null unbinds it. Words in a text prop may also hold {{expressions}}.',
  args: S.obj({ id: S.str("the part"), prop: S.str("one of its props (describe_part lists them)"), expr: { type: ["string", "null"], description: "the expression, without a leading =" } }, ["id", "prop", "expr"]),
  label: () => "Bind",
  run(s, a, ctx) {
    const { item, group } = itemById(s, a.id);
    unlocked(group, "That part");
    const def = partBySlug(item.component);
    if (!def?.props.some((d) => d.key === a.prop)) throw new OpError("invalid_value", `${item.component} has no prop ${JSON.stringify(a.prop)}. Its props are: ${(def?.props ?? []).map((d) => d.key).join(", ")}.`, a.prop);
    const expr = a.expr === null ? null : a.expr.replace(/^\s*=/, "");
    if (expr !== null) {
      if (ctx.strict) checkExpr(expr, shapeAt(s, group, ctx), "expr");
      else if (exprSyntaxError(expr)) throw new OpError("invalid_value", `expr: ${exprSyntaxError(expr)}.`, "expr");
    }
    const bind = { ...item.bind };
    if (expr === null) delete bind[a.prop];
    else bind[a.prop] = `=${expr}`;
    return setItem.run(s, { id: a.id, patch: { bind: Object.keys(bind).length ? bind : undefined } }, { ...ctx, strict: false });
  },
});

/* ---------- regions and their states ---------- */

const STATE_NAMES: Record<RegionState, Record<string, string>> = {
  ready: { en: "Content", zh: "内容", ja: "コンテンツ", ko: "콘텐츠" },
  loading: { en: "Loading", zh: "加载中", ja: "読み込み中", ko: "불러오는 중" },
  empty: { en: "Empty", zh: "空状态", ja: "空の状態", ko: "빈 상태" },
  error: { en: "Error", zh: "出错", ja: "エラー", ko: "오류" },
  forbidden: { en: "No access", zh: "无权限", ja: "権限なし", ko: "권한 없음" },
};
export const stateName = (st: RegionState, lang: string) => STATE_NAMES[st][lang] ?? STATE_NAMES[st].en;

/** the children of a region on each of its states */
export function regionDesigns(groups: Group[], region: Group): Partial<Record<RegionState, Group[]>> {
  const out: Partial<Record<RegionState, Group[]>> = {};
  for (const g of groups) {
    if (g.inFlow !== region.id) continue;
    const st = REGION_STATES[Math.max(0, Math.min(REGION_STATES.length - 1, g.pane ?? 0))];
    (out[st] ??= []).push(g);
  }
  return out;
}

/** how wide what goes in a container is: its own width less its padding, or the screen's content width */
function innerWidth(g: Group, f: Frame | undefined): number {
  const it = g.items[0];
  const w = typeof it?.props?.width === "number" && it.props.hugWidth === false ? it.props.width : f ? contentWidth(frameSizeOf(f).w) : 380;
  const pad = typeof it?.props?.padX === "number" ? it.props.padX : 0;
  return Math.max(120, Math.round(w - pad * 2));
}

/** the tap of a design's button: the source loaded again, or the sign-in screen opened */
function designTap(s: CoreState, state: RegionState, source: string | undefined): Action {
  const login = s.doc.frames.find((f) => f.auth === "login");
  if (state === "forbidden" && login) return { to: login.id, transition: "slide" };
  return source ? { to: STAY_TARGET, transition: "none", effects: [{ do: "refresh", source }] } : { to: STAY_TARGET, transition: "none" };
}

/** A kit's groups with its words and glyph made a state's: the first glyph, a title and a line, the first button's words
 *  and tap; buttons after the first go. Null when the kit has no button and one is wanted. */
function rewriteNote(built: Group[], o: { icon: string; title: string; detail: string; detailBind?: string; button?: { label: string; action: Action } }): Group[] | null {
  const comp = (g: Group) => g.items[0]?.component;
  const buttons = built.filter((g) => comp(g) === "button");
  if (o.button && !buttons.length) return null;
  const drop = new Set(buttons.slice(o.button ? 1 : 0).map((g) => g.id));
  if (!o.button) for (const b of buttons) drop.add(b.id);
  const texts = built.filter((g) => comp(g) === "text");
  let iconDone = false;
  return built
    .filter((g) => !drop.has(g.id))
    .map((g) => {
      const it = g.items[0];
      if (!it) return g;
      const set = (patch: Partial<Item>) => ({ ...g, items: [{ ...it, ...patch, props: { ...it.props, ...patch.props } }] });
      if (comp(g) === "icon" && !iconDone) {
        iconDone = true;
        return set({ props: { name: o.icon } });
      }
      if (comp(g) === "text") {
        const i = texts.indexOf(g);
        if (texts.length >= 2 ? i === 0 : false) return set({ props: { text: o.title } });
        if (texts.length >= 2 ? i === 1 : i === 0) return set({ props: { text: texts.length >= 2 ? o.detail : o.title }, ...(o.detailBind && texts.length >= 2 ? { bind: { text: o.detailBind } } : {}) });
        return g;
      }
      if (comp(g) === "button" && o.button) return set({ props: { label: o.button.label }, action: fullAction(o.button.action) });
      return g;
    });
}

/** Adds the design of one state to a region, composed in the document's style: skeletons while it loads, the empty-note
 *  kit for the others (a glyph, a title, a line, a button that loads again or signs in). It goes on the state's pane. */
function addStateDesign(s: CoreState, region: Group, state: Exclude<RegionState, "ready">, kind: "list" | "detail", ctx: OpCtx): CoreState {
  const f = screenOf(s, region, ctx);
  const lang = ctx.lang;
  const width = innerWidth(region, f);
  const source = region.states?.source;
  const user = { ...ctx, strict: false };
  let next: CoreState;
  let rootId: string | undefined;
  if (state === "loading") {
    const bones: TreeNode[] =
      kind === "list"
        ? [0, 1, 2].map(() => ({ part: "skeleton", props: { layout: "profile", width } }))
        : [
            { part: "skeleton", props: { layout: "block", width, height: 160 } },
            { part: "skeleton", props: { layout: "text", lines: 3, width } },
          ];
    const out = addTree.run(s, { tree: { part: "box", name: stateName(state, lang), props: { layout: "column", gap: 12, hugWidth: false, width, padX: 0, padY: 8 }, children: bones }, into: { container: region.id } }, user);
    next = out.state;
    rootId = out.result?.groupId;
  } else {
    const words =
      state === "empty"
        ? { icon: kind === "list" ? "inbox" : "search_off", title: appMessage(kind === "list" ? "emptyTitle" : "notFoundTitle", lang), detail: appMessage(kind === "list" ? "emptyDetail" : "notFoundDetail", lang), button: source && kind === "list" ? appMessage("refresh", lang) : undefined }
        : state === "error"
          ? { icon: "cloud_off", title: appMessage("errorTitle", lang), detail: appMessage("errorDetail", lang), button: appMessage("retry", lang), bind: source ? `=data.${source}.error.detail ?? data.${source}.error.title` : undefined }
          : { icon: "lock", title: appMessage("forbiddenTitle", lang), detail: appMessage("forbiddenDetail", lang), button: appMessage("signIn", lang) };
    const action = designTap(s, state, source);
    const build = (variant?: string) => {
      const built = buildKit(s, "empty-note", variant, f, lang);
      return built ? rewriteNote(built, { icon: words.icon, title: words.title, detail: words.detail, ...("bind" in words && words.bind ? { detailBind: words.bind } : {}), ...(words.button ? { button: { label: words.button, action } } : {}) }) : null;
    };
    const built = build() ?? build("illustrated");
    if (!built) return s;
    const sized = built.map((g, i) => (i === 0 ? { ...g, name: stateName(state, lang), items: [{ ...g.items[0], props: { ...g.items[0].props, width } }] } : g));
    const out = addKit.run(s, { slug: "empty-note", built: sized, into: { container: region.id } }, user);
    next = out.state;
    rootId = out.result?.groupId;
  }
  if (!rootId) return s;
  const pane = REGION_STATES.indexOf(state);
  return withGroups(next, next.doc.groups.map((g) => (g.id === rootId ? { ...g, pane } : g)));
}

/** whether a region's content is a list (a repeat over data) or one thing */
const kindOf = (s: CoreState, region: Group): "list" | "detail" => (region.repeat?.data !== undefined || s.doc.groups.some((g) => g.inFlow === region.id && g.repeat?.data !== undefined) ? "list" : "detail");

/** a region with a design for every state it lacks one for */
export function withDesigns(s: CoreState, regionId: string, ctx: OpCtx): CoreState {
  let state = s;
  for (const st of REGION_STATES) {
    if (st === "ready") continue;
    const region = state.doc.groups.find((g) => g.id === regionId);
    if (!region) return state;
    if (regionDesigns(state.doc.groups, region)[st]?.length) continue;
    state = addStateDesign(state, region, st, kindOf(state, region), ctx);
  }
  return state;
}

export const setRegion = op<{ id: string; source?: string | null; emptyWhen?: string | null; show?: RegionState; designs?: boolean }, { states: RegionState[] }>({
  name: "set_region",
  summary:
    "Makes a container with an auto layout a region bound to a data source of its screen: it shows its content when the data is there, and a design of its own while it loads, when it is empty, failed (error) or was refused (forbidden). Designs it has none for are added, composed in the document's style (designs: false skips that). show picks the state the canvas shows (the state switcher). emptyWhen: an expression that says the data is empty.",
  args: S.obj(
    {
      id: S.str("the container"),
      source: { type: ["string", "null"], description: "the data source (add_data_source) whose status picks the state" },
      emptyWhen: { type: ["string", "null"] },
      show: S.enum(REGION_STATES, "the state the canvas shows"),
      designs: S.bool("add the designs of the states it has none for (default true)"),
    },
    ["id"],
  ),
  label: (a) => (a.show && Object.keys(a).length === 2 ? "Show state" : "Region"),
  run(s, a, ctx) {
    const g = groupById(s, a.id);
    const it = g.items[0];
    if (!it?.props?.layout || it.props.layout === "free" || !partBySlug(it.component)?.holds) throw new OpError("invalid_value", "Only a container with an auto layout can be a region: its states are designs it holds.", a.id);
    if (partBySlug(it.component)?.panes) throw new OpError("invalid_value", "A container with tabs of its own cannot be a region.", a.id);
    const f = screenOf(s, g, ctx);
    if (a.source) {
      if (!(f?.data ?? []).some((d) => d.name === a.source)) throw new OpError("not_found", `The screen loads no data called ${JSON.stringify(a.source)}${f?.data?.length ? ` (it loads ${f.data.map((d) => d.name).join(", ")})` : " (add_data_source adds one)"}.`, a.source);
    }
    if (a.emptyWhen) checkExpr(a.emptyWhen, shapeAt(s, g, ctx), "emptyWhen");
    const was = g.states ?? {};
    const region = {
      ...was,
      ...(a.source !== undefined ? { source: a.source ?? undefined } : {}),
      ...(a.emptyWhen !== undefined ? { emptyWhen: a.emptyWhen ?? undefined } : {}),
      ...(a.show !== undefined ? { show: a.show === "ready" ? undefined : a.show } : {}),
    };
    const clean = Object.fromEntries(Object.entries(region).filter(([, v]) => v !== undefined));
    let state = withGroup(s, { ...g, states: clean });
    if (a.designs !== false && !(a.show !== undefined && g.states && Object.keys(a).length === 2)) state = withDesigns(state, g.id, ctx);
    const after = state.doc.groups.find((x) => x.id === g.id)!;
    const have = regionDesigns(state.doc.groups, after);
    return { state: laidOut(state, ctx.widths), result: { states: REGION_STATES.filter((st) => st === "ready" || !!have[st]?.length) } };
  },
});

export const removeRegion = op<{ id: string; keepDesigns?: boolean }>({
  name: "remove_region",
  summary: "Makes a region a plain container again: its state designs are removed with what they hold (keepDesigns: they stay, as content).",
  args: S.obj({ id: S.str(), keepDesigns: S.bool() }, ["id"]),
  label: () => "Remove region",
  run(s, a, ctx) {
    const g = groupById(s, a.id);
    if (!g.states) throw new OpError("nothing_to_do", "That container is no region.", a.id);
    const designs = s.doc.groups.filter((x) => x.inFlow === g.id && (x.pane ?? 0) > 0);
    const gone = new Set(a.keepDesigns ? [] : designs.flatMap((d) => [d.id, ...heldBy(d, s.doc.groups, ctx.widths).map((x) => x.id)]));
    const groups = s.doc.groups.filter((x) => !gone.has(x.id)).map((x) => (x.id === g.id ? groupPatch(x, "states", undefined) : designs.some((d) => d.id === x.id) ? groupPatch(x, "pane", undefined) : x));
    return { state: laidOut(withGroups(s, groups), ctx.widths) };
  },
});

/* ---------- forms ---------- */

const BODY_ARGS = {
  params: S.any("the endpoint's params by name, each an expression"),
  values: S.any("body fields no input fills, each an expression"),
  // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
  then: S.any("what runs when it answers 2XX: an action body {to, params, effects} (response to read)"),
  catch: S.any("what runs when it fails: an action body (error to read)"),
};

function checkedForm(s: CoreState, g: Group, form: FormBinding, ctx: OpCtx) {
  const { api, e } = endpoint(s, form.operationId);
  if (!e.requestBody && ctx.strict) throw new OpError("invalid_value", `${form.operationId} takes no request body, so a form has nothing to fill: use a call (set_action {effects: [{do: "call"}]}) instead.`, form.operationId);
  const shape = shapeAt(s, g, ctx);
  const takes = paramsOf(api, e).map((p) => p.name);
  for (const [k, x] of Object.entries(form.params ?? {})) {
    if (ctx.strict && !takes.includes(k)) throw new OpError("invalid_value", `${form.operationId} takes no param ${JSON.stringify(k)}.`, k);
    checkExpr(x, shape, `params.${k}`);
  }
  for (const [k, x] of Object.entries(form.values ?? {})) checkExpr(x, shape, `values.${k}`);
  for (const k of ["then", "catch"] as const) {
    if (!form[k]) continue;
    const err = actionError({ ...form[k], transition: form[k]!.transition ?? "none" }, s);
    if (err && ctx.strict) throw new OpError("invalid_value", `${k}: ${err}.`, k);
  }
}

const bodyOfArg = (v: unknown): ActionBody | undefined => (v && typeof v === "object" ? (fullAction({ to: STAY_TARGET, ...(v as Partial<Action>) } as Action) as ActionBody) : undefined);

function formOf(a: { operationId: string; params?: unknown; values?: unknown; then?: unknown; catch?: unknown }): FormBinding {
  const then = bodyOfArg(a.then);
  const fail = bodyOfArg(a.catch);
  return {
    operationId: a.operationId,
    ...(a.params && typeof a.params === "object" && Object.keys(a.params).length ? { params: a.params as Record<string, string> } : {}),
    ...(a.values && typeof a.values === "object" && Object.keys(a.values).length ? { values: a.values as Record<string, string> } : {}),
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    ...(then ? { then } : {}),
    ...(fail ? { catch: fail } : {}),
  };
}

export const setForm = op<{ id: string; form: { operationId: string; params?: Record<string, string>; values?: Record<string, string>; then?: ActionBody; catch?: ActionBody } | null }>({
  name: "set_form",
  summary: "Makes a container a form for an endpoint's request body ({operationId, params, values, then, catch}), or a plain container again (null). Inputs inside it fill the body by bind_field; a tap with {do: \"submit\"} submits it. make_form also composes the fields.",
  args: S.obj({ id: S.str("the container"), form: { type: ["object", "null"], properties: { operationId: S.str(), ...BODY_ARGS }, required: ["operationId"] } }, ["id", "form"]),
  label: () => "Form",
  run(s, a, ctx) {
    const g = groupById(s, a.id);
    unlocked(g, "That container");
    if (!a.form) return { state: withGroup(s, groupPatch(g, "form", undefined)) };
    if (!partBySlug(g.items[0]?.component)?.holds) throw new OpError("invalid_value", "Only a container can be a form.", a.id);
    const form = formOf(a.form);
    checkedForm(withGroup(s, { ...g, form }), { ...g, form }, form, ctx);
    return { state: withGroup(s, { ...g, form }) };
  },
});

/** the inputs a part's id can be bound with: what the preview reads a value of */
const isInput = (it: Item) => INPUT_PROP[it.component ?? ""] !== undefined || it.component === "file-upload";

/** the form around a group: the nearest container with a form it is laid out in */
export function formAround(groups: Group[], g: Group): Group | undefined {
  const byId = new Map(groups.map((x) => [x.id, x]));
  let at: Group | undefined = g;
  for (let i = 0; at && i < 64; i++) {
    if (at.form) return at;
    at = at.inFlow ? byId.get(at.inFlow) : undefined;
  }
  return undefined;
}

export const bindField = op<{ id: string; field: string | null }>({
  name: "bind_field",
  summary: 'Binds an input inside a form to a field of its request body ("email", "address.city"): it fills that field, is checked by the field\'s schema, and shows its error. null unbinds it.',
  args: S.obj({ id: S.str("the input"), field: { type: ["string", "null"] } }, ["id", "field"]),
  label: () => "Form field",
  run(s, a, ctx) {
    const { item, group } = itemById(s, a.id);
    if (a.field !== null) {
      if (!isInput(item)) throw new OpError("invalid_value", `${item.component} is no input: a form's field is a part that declares an input (describe_part lists it: a text field, select, switch, slider, rating, number pad…) or a file upload.`, a.id);
      if (!FIELD_PATH.test(a.field)) throw new OpError("invalid_value", `${JSON.stringify(a.field)} is no field name.`, a.field);
      const form = formAround(s.doc.groups, group);
      if (ctx.strict && !form) throw new OpError("invalid_value", "That input is in no form: make_form or set_form makes its container one.", a.id);
      if (ctx.strict && form) {
        const { api, e } = endpoint(s, form.form!.operationId);
        const names = formFields(api, e).map((f) => f.name);
        if (names.length && !names.includes(a.field)) throw new OpError("invalid_value", `${form.form!.operationId}'s body has no field ${JSON.stringify(a.field)} (it has ${names.join(", ")}).`, a.field);
      }
    }
    return setItem.run(s, { id: a.id, patch: { field: a.field ?? undefined } }, { ...ctx, strict: false });
  },
});

/** placeholder words for an input of a kind */
function hintOf(f: FieldSpec, lang: string): string {
  if (f.kind === "email") return "name@example.com";
  if (f.kind === "date") return "YYYY-MM-DD";
  if (f.kind === "url") return "https://";
  return f.required ? f.title : `${f.title} · ${appMessage("optional", lang)}`;
}

/** what a field's helper line says before anything is wrong: its description, else the rule a person must keep */
function helperOf(f: FieldSpec, lang: string): string {
  if (f.description) return f.description;
  const s = f.schema;
  if (typeof s.minLength === "number" && s.minLength > 1) return appMessage("minLength", lang, s.minLength);
  if (typeof s.maxLength === "number") return appMessage("maxLength", lang, s.maxLength);
  if (typeof s.minimum === "number") return appMessage("minimum", lang, s.minimum);
  return f.required ? appMessage("required", lang) : appMessage("optional", lang);
}

const INPUT_TYPE: Partial<Record<FieldSpec["kind"], string>> = { email: "email", password: "password", number: "number", integer: "number", url: "url", tel: "tel" };

/** a helper line under a field: its hint, or its error once there is one, in the error's color */
const helperNode = (f: FieldSpec, lang: string): TreeNode => ({
  part: "text",
  name: `${f.title} help`,
  props: { text: helperOf(f, lang), style: "caption", color: "muted" },
  bind: { text: `=form.errors.${f.name} ?? ${JSON.stringify(helperOf(f, lang))}`, color: `=form.errors.${f.name} ? "error" : "muted"` },
});

/** Adds the input of one field to a form, composed in the document's style: the labeled-field kit for words and numbers,
 *  a select, a switch, a file upload with its progress; each bound to its field, with a helper line that turns into
 *  its error. */
function addField(s: CoreState, form: Group, f: FieldSpec, ctx: OpCtx): { state: CoreState; itemId?: string } {
  const lang = ctx.lang;
  const frame = screenOf(s, form, ctx);
  const width = innerWidth(form, frame);
  const user = { ...ctx, strict: false };
  const into = { container: form.id };
  const tree = (t: TreeNode) => addTree.run(s, { tree: t, into }, user);
  if (f.kind === "select") {
    const out = tree({ part: "box", name: f.title, props: { layout: "column", gap: 4, hugWidth: false, width }, children: [{ part: "select", id: undefined, props: { label: f.title, placeholder: f.title, items: (f.options ?? []).slice(0, 8).map((label) => ({ label })), selected: -1, width } }, helperNode(f, lang)] });
    return marked(out.state, out.result?.groupId, "select", f.name);
  }
  if (f.kind === "switch") {
    const out = tree({ part: "switch", props: { label: f.title, checked: f.schema.default === true, width } });
    return marked(out.state, out.result?.groupId, "switch", f.name);
  }
  if (f.kind === "file") {
    const out = tree({
      part: "box",
      name: f.title,
      props: { layout: "column", gap: 8, hugWidth: false, width },
      children: [
        { part: "file-upload", props: { title: f.title, hint: f.description ?? (typeof f.schema.contentMediaType === "string" ? f.schema.contentMediaType : ""), multiple: false, width } },
        { part: "progress", props: { value: 0, width }, bind: { value: "=form.progress ?? 0" }, showWhen: { expr: "form.progress != null" } },
        helperNode(f, lang),
      ],
    });
    return marked(out.state, out.result?.groupId, "file-upload", f.name);
  }
  if (f.kind === "textarea") {
    const out = tree({ part: "box", name: f.title, props: { layout: "column", gap: 4, hugWidth: false, width }, children: [{ part: "text", props: { text: f.title, style: "label", bold: true } }, { part: "textarea", props: { placeholder: hintOf(f, lang), width } }, helperNode(f, lang)] });
    return marked(out.state, out.result?.groupId, "textarea", f.name);
  }
  /* words and numbers: the labeled-field kit as the style composes it, its words and type made the field's */
  const built = buildKit(s, "labeled-field", undefined, frame, lang);
  if (!built) return { state: s };
  const texts = built.filter((g) => g.items[0]?.component === "text");
  const helper = texts.find((g) => g.items[0].props?.color === "muted" || g.items[0].props?.style === "caption");
  const label = texts.find((g) => g !== helper);
  const rewritten = built.map((g, i) => {
    const it = g.items[0];
    if (!it) return g;
    if (i === 0) return { ...g, name: f.title, items: [{ ...it, props: { ...it.props, width } }] };
    if (it.component === "input") return { ...g, items: [{ ...it, field: f.name, props: { ...it.props, placeholder: label ? hintOf(f, lang) : f.title, type: INPUT_TYPE[f.kind] ?? "text" } }] };
    if (g === label) return { ...g, items: [{ ...it, props: { ...it.props, text: f.required ? `${f.title} *` : f.title } }] };
    if (g === helper) return { ...g, items: [{ ...it, props: { ...it.props, text: helperOf(f, lang) }, bind: helperNode(f, lang).bind }] };
    return g;
  });
  const out = addKit.run(s, { slug: "labeled-field", built: rewritten, into }, user);
  let state = out.state;
  /* a composition with no line under the field gets one, so the field's error has a place */
  if (!helper) state = addTree.run(state, { tree: helperNode(f, lang), into }, user).state;
  const input = state.doc.groups.flatMap((g) => g.items).find((it) => it.field === f.name && it.component === "input");
  return { state, itemId: input?.id };
}

/** the input of a field just added, bound to it */
function marked(s: CoreState, rootGroupId: string | undefined, slug: string, field: string): { state: CoreState; itemId?: string } {
  if (!rootGroupId) return { state: s };
  const root = s.doc.groups.find((g) => g.id === rootGroupId);
  if (!root) return { state: s };
  const inside = [root, ...s.doc.groups.filter((g) => g.inFlow === root.id)];
  const target = inside.find((g) => g.items[0]?.component === slug);
  if (!target) return { state: s };
  const it = target.items[0];
  return { state: withGroup(s, { ...target, items: [{ ...it, field }] }), itemId: it.id };
}

export const makeForm = op<
  { id?: string; screen?: string; into?: { container: string; index?: number }; operationId: string; fields?: string[]; submitLabel?: string; params?: Record<string, string>; values?: Record<string, string>; then?: ActionBody; catch?: ActionBody },
  { formId: string; fields: { field: string; itemId?: string }[]; submitId?: string }
>({
  name: "make_form",
  summary:
    "Makes a form for an endpoint's request body in one step: the container given (id) or a new one (on screen, or into a container) becomes the form, and an input for each body field (or those listed in fields) is composed in the document's style from the schema (text, email, password, number, date, select from enum, switch, file upload with progress), each bound to its field, checked by its schema and showing its error; then a submit button and a line for the form's error. then/catch run after the answer.",
  args: S.obj(
    {
      id: S.str("a container with an auto layout to make the form"),
      screen: S.str("the screen a new form goes on"),
      into: S.obj({ container: S.str(), index: S.int() }, ["container"]),
      operationId: S.str(),
      fields: S.arr(S.str(), "the body fields to compose, in order (all the writable ones when left out)"),
      submitLabel: S.str(),
      ...BODY_ARGS,
    },
    ["operationId"],
  ),
  label: () => "Make form",
  run(s, a, ctx) {
    const { api, e } = endpoint(s, a.operationId);
    const specs = formFields(api, e);
    if (!specs.length && ctx.strict) throw new OpError("invalid_value", `${a.operationId}'s request body has no fields a person writes (describe_endpoint shows it).`, a.operationId);
    const user = { ...ctx, strict: false };
    let state = s;
    let formId: string;
    if (a.id) {
      const g = groupById(s, a.id);
      unlocked(g, "That container");
      if (!partBySlug(g.items[0]?.component)?.holds || !g.items[0]?.props?.layout || g.items[0].props.layout === "free") throw new OpError("invalid_value", "Only a container with an auto layout can be made a form.", a.id);
      formId = g.id;
    } else {
      const f = a.screen ? frameById(s, a.screen) : (s.doc.frames.find((x) => x.id === s.session.frameId) ?? s.doc.frames[0]);
      if (!f && !a.into) throw new OpError("invalid_value", "There is no screen to put the form on: give screen or into.");
      const width = f ? contentWidth(frameSizeOf(f).w) : 380;
      const out = addTree.run(s, { tree: { part: "box", name: e.summary ?? titleOf(a.operationId), props: { layout: "column", gap: 12, hugWidth: false, width, padX: 0, padY: 0 } }, ...(a.into ? { into: a.into } : { screen: f!.id }) }, user);
      state = out.state;
      formId = out.result!.groupId;
    }
    const form = formOf(a);
    const host = state.doc.groups.find((g) => g.id === formId)!;
    checkedForm(withGroup(state, { ...host, form }), { ...host, form }, form, ctx);
    state = withGroup(state, { ...host, form });
    /* the fields not bound yet, in the order asked or the schema's */
    const bound = new Set(state.doc.groups.filter((g) => formAround(state.doc.groups, g)?.id === formId).flatMap((g) => g.items.map((it) => it.field).filter(Boolean)));
    const wanted = a.fields ? a.fields.map((n) => specs.find((x) => x.name === n) ?? (ctx.strict ? (() => { throw new OpError("invalid_value", `${a.operationId}'s body has no field ${JSON.stringify(n)} (it has ${specs.map((x) => x.name).join(", ")}).`, n); })() : undefined)).filter((x): x is FieldSpec => !!x) : specs;
    const fields: { field: string; itemId?: string }[] = [];
    for (const f of wanted) {
      if (bound.has(f.name)) continue;
      const out = addField(state, state.doc.groups.find((g) => g.id === formId)!, f, ctx);
      state = out.state;
      fields.push({ field: f.name, itemId: out.itemId });
    }
    /* the form's own error, then the button that submits it */
    const lang = ctx.lang;
    state = addTree.run(state, { tree: { part: "text", name: "Form error", props: { text: appMessage("submitFailed", lang), style: "body", color: "error", fit: "fixed", width: innerWidth(state.doc.groups.find((g) => g.id === formId)!, screenOf(state, host, ctx)) }, bind: { text: `=form.error.detail ?? form.error.title ?? ${JSON.stringify(appMessage("submitFailed", lang))}` }, showWhen: { expr: "form.error" } }, into: { container: formId } }, user).state;
    const login = s.doc.api?.auth?.login === a.operationId;
    const submit = addTree.run(state, { tree: { part: "button", props: { label: a.submitLabel ?? (login ? appMessage("signIn", lang) : e.summary && e.summary.length <= 24 ? e.summary : appMessage("submit", lang)), variant: "filled", size: "default" }, action: { to: STAY_TARGET, effects: [{ do: "submit" }] } }, into: { container: formId } }, user);
    state = submit.state;
    return { state: withSession(laidOut(state, ctx.widths), { selection: [state.doc.groups.find((g) => g.id === formId)!.items[0].id], frameId: null }), result: { formId, fields, submitId: submit.result?.itemId } };
  },
});

/* ---------- the helper: a screen wired to an endpoint ---------- */

type Fields = { title?: string; subtitle?: string; image?: string; trailing?: { name: string; how: "currency" | "relative" | "number" | "text" }; id?: string; rest: { name: string; how: "currency" | "relative" | "date" | "number" | "text" | "bool" }[]; /** what each field is called: its schema's title, else words from its name */ label: (name: string) => string };

const NAMES = {
  title: ["title", "name", "label", "headline", "subject", "displayName", "fullName", "username"],
  subtitle: ["subtitle", "description", "summary", "excerpt", "email", "body", "text", "content", "bio", "address"],
  image: ["image", "imageUrl", "avatar", "avatarUrl", "photo", "photoUrl", "picture", "thumbnail", "thumbnailUrl", "cover", "coverUrl", "icon", "logo"],
  money: /price|amount|total|cost|balance|fee|salary/i,
};

/** what a row or a detail shows of an element: its title, a line under it, a picture, a value at its end, the rest */
function pickFields(api: ApiSpec, schema: JsonSchema | undefined): Fields {
  const s = resolved(api, schema);
  const props = s?.properties && typeof s.properties === "object" ? s.properties : {};
  const rows = Object.entries(props).map(([name, raw]) => ({ name, s: resolved(api, raw as JsonSchema) ?? ({} as JsonSchemaObject) }));
  const typeOf = (x: JsonSchemaObject) => (Array.isArray(x.type) ? x.type.find((t) => t !== "null") : x.type);
  const isText = (x: JsonSchemaObject) => typeOf(x) === "string" && x.format !== "date-time" && x.format !== "date" && x.format !== "binary";
  const by = (names: string[], ok: (x: JsonSchemaObject) => boolean) => names.map((n) => rows.find((r) => r.name.toLowerCase() === n.toLowerCase() && ok(r.s))).find(Boolean)?.name;
  const image = by(NAMES.image, (x) => typeOf(x) === "string") ?? rows.find((r) => typeOf(r.s) === "string" && (r.s.format === "uri" || r.s.format === "url") && /image|photo|avatar|thumb|cover|picture/i.test(r.name))?.name;
  const title = by(NAMES.title, isText) ?? rows.find((r) => isText(r.s) && r.name !== "id" && r.name !== image && r.s.format !== "uuid" && r.s.format !== "uri")?.name;
  const subtitle = by(NAMES.subtitle, isText) ?? undefined;
  const money = rows.find((r) => (typeOf(r.s) === "number" || typeOf(r.s) === "integer") && NAMES.money.test(r.name));
  const when = rows.find((r) => r.s.format === "date-time" || r.s.format === "date");
  const trailing = money ? { name: money.name, how: "currency" as const } : when ? { name: when.name, how: "relative" as const } : undefined;
  const used = new Set([title, subtitle, image, trailing?.name, "id"]);
  const rest = rows
    .filter((r) => !used.has(r.name) && typeOf(r.s) !== "object" && typeOf(r.s) !== "array" && r.s.format !== "binary")
    .map((r) => ({ name: r.name, how: (NAMES.money.test(r.name) && (typeOf(r.s) === "number" || typeOf(r.s) === "integer") ? "currency" : r.s.format === "date-time" ? "relative" : r.s.format === "date" ? "date" : typeOf(r.s) === "number" || typeOf(r.s) === "integer" ? "number" : typeOf(r.s) === "boolean" ? "bool" : "text") as Fields["rest"][number]["how"] }));
  const titles = new Map(rows.map((r) => [r.name, typeof r.s.title === "string" && r.s.title.trim() ? r.s.title.trim() : titleOf(r.name)]));
  return { title, subtitle, image, trailing, id: rows.some((r) => r.name === "id") ? "id" : undefined, rest, label: (name) => titles.get(name) ?? titleOf(name) };
}

/** an expression that writes a field as people read it */
function formatted(path: string, how: string): string {
  if (how === "currency") return `currency(${path})`;
  if (how === "relative") return `relative(${path})`;
  if (how === "date") return `date(${path})`;
  if (how === "number") return `number(${path})`;
  return path;
}

/** a row of a list: a picture, a title over a line, a value at its end, each bound to the element's fields */
function rowTree(api: ApiSpec, item: JsonSchema | undefined, width: number, tap: Action | undefined): TreeNode {
  const f = pickFields(api, item);
  const kids: TreeNode[] = [];
  if (f.image) kids.push({ part: "image", props: { width: 48, height: 48, radius: 8 }, bind: { src: `=item.${f.image}` } });
  const lines: TreeNode[] = [];
  if (f.title) lines.push({ part: "text", props: { text: f.label(f.title), style: "lead", maxLines: 1, fit: "fixed" }, bind: { text: `=item.${f.title}` } });
  if (f.subtitle) lines.push({ part: "text", props: { text: f.label(f.subtitle), style: "caption", color: "muted", maxLines: 2, fit: "fixed" }, bind: { text: `=item.${f.subtitle}` } });
  if (!lines.length) lines.push({ part: "text", props: { text: "Item", style: "lead" }, bind: { text: f.id ? `=item.${f.id}` : "=item" } });
  kids.push({ part: "box", props: { layout: "column", gap: 2, padX: 0, padY: 0, align: "stretch", hugWidth: true }, grow: true, children: lines });
  if (f.trailing) kids.push({ part: "text", props: { text: f.label(f.trailing.name), style: "label" }, bind: { text: `=${formatted(`item.${f.trailing.name}`, f.trailing.how)}` } });
  return { part: "box", name: "Row", props: { layout: "row", gap: 12, padX: 16, padY: 12, align: "center", hugWidth: false, width }, children: kids, ...(tap ? { action: tap as unknown as Record<string, unknown> } : {}) };
}

/** one thing in full: a picture, a headline, a line, and a label and value for each of the rest */
function detailTree(api: ApiSpec, schema: JsonSchema | undefined, source: string, width: number): TreeNode[] {
  const f = pickFields(api, schema);
  const v = (name: string) => `data.${source}.value.${name}`;
  const out: TreeNode[] = [];
  if (f.image) out.push({ part: "image", props: { width, height: 200 }, bind: { src: `=${v(f.image)}` } });
  if (f.title) out.push({ part: "text", props: { text: f.label(f.title), style: "headline", fit: "fixed" }, bind: { text: `=${v(f.title)}` } });
  if (f.trailing) out.push({ part: "text", props: { text: f.label(f.trailing.name), style: "title", color: "primary" }, bind: { text: `=${formatted(v(f.trailing.name), f.trailing.how)}` } });
  if (f.subtitle) out.push({ part: "text", props: { text: f.label(f.subtitle), style: "body", color: "muted", fit: "fixed" }, bind: { text: `=${v(f.subtitle)}` } });
  for (const r of f.rest.slice(0, 8))
    out.push({
      part: "box",
      props: { layout: "row", gap: 8, padX: 0, padY: 4, justify: "between", align: "center", hugWidth: false, width },
      children: [
        { part: "text", props: { text: f.label(r.name), style: "body", color: "muted" } },
        { part: "text", props: { text: f.label(r.name), style: "body" }, bind: { text: r.how === "bool" ? `=${v(r.name)} ? "✓" : "—"` : `=${formatted(v(r.name), r.how)}` } },
      ],
    });
  return out;
}

/** the params a tap passes to a screen: each param the screen takes, from the element's field of the same name, or its id */
function paramsTo(target: Frame | undefined, itemFields: string[]): Record<string, string> | undefined {
  if (!target?.params?.length) return undefined;
  const out: Record<string, string> = {};
  for (const p of target.params) {
    const same = itemFields.find((n) => n === p.name);
    const id = itemFields.includes("id") ? "id" : undefined;
    const pick = same ?? (/id$/i.test(p.name) ? id : undefined);
    if (pick) out[p.name] = `item.${pick}`;
  }
  return Object.keys(out).length ? out : undefined;
}

export const wireScreen = op<
  { screen: string; operationId: string; name?: string; into?: string; detail?: string; paging?: "scroll" | "button"; params?: Record<string, string> },
  { source: string; region: string; template?: string; parts: number; addedParams: string[]; states: RegionState[] }
>({
  name: "wire_screen",
  summary:
    "Wires a screen to an endpoint in one step: a data source for it; for a list endpoint a region repeating a row bound to each element's fields (a tap opens `detail` with its params), with pull to refresh and the next page on scroll or by a Load more button; for one thing a region showing its fields; either way with designs for loading, empty, error and forbidden in the document's style. Path params read the screen's params (declared if missing).",
  args: S.obj(
    {
      screen: S.str(),
      operationId: S.str(),
      name: S.str("the data source's name (default from the operationId)"),
      into: S.str("a container with an auto layout to put the region in (the screen's body when left out)"),
      detail: S.str("for a list: the screen a tap on a row opens, given the row's id as its params"),
      paging: S.enum(["scroll", "button"], "for a paged list: the next page on scroll (default) or by a Load more button"),
      params: S.any("the source's params by name, each an expression"),
    },
    ["screen", "operationId"],
  ),
  label: () => "Wire screen to API",
  run(s, a, ctx) {
    const f = frameById(s, a.screen);
    const { api, e } = endpoint(s, a.operationId);
    const detail = a.detail ? frameById(s, a.detail) : undefined;
    const list = listOf(api, e);
    const user = { ...ctx, strict: false };
    /* the data source */
    const added = addDataSource.run(s, { screen: f.id, operationId: a.operationId, ...(a.name ? { name: a.name } : {}), ...(a.params ? { params: a.params } : {}), ...(list ? { pullToRefresh: true, ...(e.pagination ? { paging: a.paging ?? "scroll", pageSize: 20 } : {}) } : {}) }, ctx);
    let state = added.state;
    const name = added.result!.name;
    const addedParams = [...added.result!.addedParams];
    const frame = frameById(state, f.id);
    const width = contentWidth(frameSizeOf(frame).w);
    /* the region */
    const region = addTree.run(state, { tree: { part: "box", name: titleOf(name), props: { layout: "column", gap: list ? 0 : 12, padX: 0, padY: list ? 0 : 8, hugWidth: false, width } }, ...(a.into ? { into: { container: a.into } } : { screen: f.id }) }, user);
    state = region.state;
    const regionId = region.result!.groupId;
    let template: string | undefined;
    if (list) {
      const itemNames = Object.keys(resolved(api, list.item)?.properties ?? {});
      /* a detail screen not wired yet is told the param it will need: the one the list's get-one endpoint names
         (/products/{productId}), so the screens can be wired in either order */
      let target = detail;
      if (target && !target.params?.length && itemNames.includes("id")) {
        const one = (api.endpoints ?? []).find((x) => x.method.toLowerCase() === "get" && x.path.startsWith(`${e.path.replace(/\/$/, "")}/{`) && /^\/\{[^{}/]+\}$/.test(x.path.slice(e.path.replace(/\/$/, "").length)));
        const name = one ? one.path.slice(one.path.lastIndexOf("{") + 1, -1) : "id";
        if (BINDING_NAME.test(name)) {
          target = { ...target, params: [{ name, type: "string" }] };
          state = withFrame(state, target);
          addedParams.push(`${target.id}.${name}`);
        }
      }
      const params = target ? paramsTo(target, itemNames) : undefined;
      const tap: Action | undefined = target ? { to: target.id, transition: "slide", ...(params ? { params } : {}) } : undefined;
      const row = addTree.run(state, { tree: rowTree(api, list.item, width, tap), into: { container: regionId } }, user);
      state = row.state;
      template = row.result?.itemId;
      const host = state.doc.groups.find((g) => g.id === regionId)!;
      state = withGroup(state, { ...host, repeat: { data: `data.${name}.items` } });
      if (e.pagination && a.paging === "button") {
        state = addTree.run(state, { tree: { part: "button", name: "Load more", props: { label: appMessage("loadMore", ctx.lang), variant: "tonal" }, action: { to: STAY_TARGET, effects: [{ do: "loadMore", source: name }] }, showWhen: { expr: `data.${name}.hasMore` } }, into: { container: regionId } }, user).state;
      }
    } else {
      for (const node of detailTree(api, responseSchema(api, e), name, width)) state = addTree.run(state, { tree: node, into: { container: regionId } }, user).state;
    }
    /* its states, and their designs */
    const host = state.doc.groups.find((g) => g.id === regionId)!;
    state = withGroup(state, { ...host, states: { source: name } });
    state = withDesigns(state, regionId, ctx);
    const after = state.doc.groups.find((g) => g.id === regionId)!;
    const have = regionDesigns(state.doc.groups, after);
    const parts = state.doc.groups.length - s.doc.groups.length;
    return {
      state: withSession(laidOut(state, ctx.widths), { selection: [after.items[0].id], frameId: null }),
      result: { source: name, region: after.items[0].id, ...(template ? { template } : {}), parts, addedParams, states: REGION_STATES.filter((st) => st === "ready" || !!have[st]?.length) },
    };
  },
});
