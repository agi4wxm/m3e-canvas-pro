import { createContext, useContext, useMemo, useState } from "react";
import type { ApiSpec } from "@/lib/api/types";
import { endpointOf, paramsOf, requestOf, responseSchema } from "@/lib/bindings/contract";
import { listPaths, shapeFor, type ScopeShape } from "@/lib/bindings/complete";
import { bindExpr, boundVarOf } from "@/lib/bindings/bind";
import { formAround, regionDesigns } from "@/lib/core/ops/bindings";
import type { Op } from "@/lib/core";
import * as ops from "@/lib/core/ops";
import { INPUT_PROP } from "@/lib/interact";
import { SAMPLE_ROWS } from "@/lib/collections";
import { REGION_STATES, frameOfPart, type DataSource, type Doc, type Frame, type Group, type Item, type Palette, type RegionState } from "@/lib/tokens";
import { t, useLang, type UIKey } from "@/lib/i18n";
import { partBySlug } from "@/parts/registry";
import { labelOf } from "@/parts/labels";
import { BehaviorContext, BodyEditor } from "./EffectsPanel";
import { DesignSection, actionBtn } from "./DesignPanel";
import { ExprField } from "./ExprField";
import { Icon } from "./Icon";
import { Num } from "./PartPanel";
import { Field, IconBtn, Section, Segmented, Select, Toggle } from "./ui";

/* The Data sections of the panels (lib/bindings, docs/数据绑定.md): on a screen, the data it loads, the params it is
 * opened with and whether it needs a session, and the one step that wires it to an endpoint; on a part, its props
 * bound to expressions, a container repeated from data, made a region that shows the state of its data, or a form for
 * an endpoint; on an input in a form, the field it fills. Each change is one operation of the document core, so it is
 * one step back, and what the AI and MCP do through the same operations shows here. */

export type Bindings = {
  doc: Pick<Doc, "api" | "vars" | "groups" | "collections" | "frames" | "capabilities">;
  widths: Record<string, number>;
  /** runs an operation of the panels: what it reported, or undefined when it was refused (a toast says why) */
  run: <A>(o: Op<A, unknown>, args: A, coalesce?: string) => unknown;
};

export const BindingsContext = createContext<Bindings | null>(null);

const label = (p: Palette): React.CSSProperties => ({ fontSize: 11, fontWeight: 600, color: p.onSurfaceVariant, padding: "2px 2px 0" });
const hint = (p: Palette): React.CSSProperties => ({ fontSize: 11, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 2px", textWrap: "pretty" });
const card = (p: Palette): React.CSSProperties => ({ display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 10, background: p.surfaceContainerLow });

/** the shape of what an expression can read at a screen, or at a part on it */
export function useShape(frame: Frame | undefined, groupId?: string): ScopeShape {
  const b = useContext(BindingsContext);
  return useMemo(() => (b ? shapeFor(b.doc, frame, groupId, b.widths) : { sources: [], params: [], vars: [], inRepeat: false }), [b, frame, groupId]);
}

/** The shape of what an expression can read where the selected part is (its screen, the repeat and form around it),
 *  with what a call's branch adds: its `response`, or its `error`. */
export function usePartShape(extra?: { response?: unknown; error?: boolean }): ScopeShape {
  const b = useContext(BindingsContext);
  const group = useContext(BehaviorContext).group;
  return useMemo(() => {
    if (!b) return { sources: [], params: [], vars: [], inRepeat: false };
    const frame = group ? frameOfPart(group, b.doc.groups, b.doc.frames, b.widths) : undefined;
    const shape = shapeFor(b.doc, frame, group?.id, b.widths);
    return { ...shape, ...(extra?.response !== undefined ? { response: extra.response === true ? undefined : (extra.response as ScopeShape["response"]) } : {}), ...(extra?.error ? { error: true } : {}) };
  }, [b, group, extra?.response, extra?.error]);
}

/** What a tap gives the screen it opens: one expression per param that screen takes. */
export function NavParams({ to, value, onChange, p, extra }: { to: string; value: Record<string, string> | undefined; onChange: (v: Record<string, string> | undefined) => void; p: Palette; extra?: { response?: unknown; error?: boolean } }) {
  const lang = useLang();
  const b = useContext(BindingsContext);
  const shape = usePartShape(extra);
  const target = b?.doc.frames.find((f) => f.id === to);
  if (!b || !target?.params?.length) return null;
  const put = (k: string, v: string) => {
    const next = { ...value };
    if (v) next[k] = v;
    else delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div data-nav-params style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={label(p)}>{t("bdNavParams", lang)}</div>
      {target.params.map((prm) => (
        <div key={prm.name} style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 6, alignItems: "start" }}>
          <span style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: p.onSurfaceVariant, paddingTop: 8, overflow: "hidden", textOverflow: "ellipsis" }}>{prm.name}</span>
          <ExprField name={`param:${prm.name}`} value={value?.[prm.name] ?? ""} onCommit={(v) => put(prm.name, v)} shape={shape} api={b.doc.api} p={p} label={prm.name} />
        </div>
      ))}
    </div>
  );
}

/** the endpoints as options, the ones that read first */
export function endpointOptions(api: ApiSpec | undefined, only?: (method: string) => boolean) {
  return (api?.endpoints ?? []).filter((e) => !only || only(e.method)).map((e) => ({ key: e.operationId, label: `${e.method.toUpperCase()} ${e.path} · ${e.operationId}`, icon: e.method === "get" ? "download" : "upload" }));
}

/** an endpoint's params, each an expression field */
export function ArgFields({ api, operationId, value, onChange, shape, p, body }: { api: ApiSpec | undefined; operationId: string; value: Record<string, string> | undefined; onChange: (v: Record<string, string> | undefined) => void; shape: ScopeShape; p: Palette; body?: boolean }) {
  const lang = useLang();
  const e = endpointOf(api, operationId);
  if (!e || !api) return null;
  const names = paramsOf(api, e).map((x) => x.name);
  const req = body ? requestOf(api, e) : undefined;
  const fields = req?.schema?.properties ? Object.keys(req.schema.properties) : [];
  const all = [...names, ...fields.filter((f) => !names.includes(f))];
  if (!all.length) return null;
  const put = (k: string, v: string) => {
    const next = { ...value };
    if (v) next[k] = v;
    else delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div data-arg-fields style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={label(p)}>{t("bdArgs", lang)}</div>
      {all.map((k) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 6, alignItems: "start" }}>
          <span title={k} style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: p.onSurfaceVariant, paddingTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {k}
          </span>
          <ExprField name={`arg:${k}`} value={value?.[k] ?? ""} onCommit={(v) => put(k, v)} shape={shape} api={api} p={p} label={k} />
        </div>
      ))}
    </div>
  );
}

/** A form's body fields that no input in it fills, each an expression (`FormBinding.values`): what the visitor does not
 *  type, sent all the same (the signed-in user's id, a screen param). */
function FormValues({ api, form, group, groups, shape, p, onChange }: { api: ApiSpec | undefined; form: NonNullable<Group["form"]>; group: Group; groups: Group[]; shape: ScopeShape; p: Palette; onChange: (v: Record<string, string> | undefined) => void }) {
  const lang = useLang();
  const e = endpointOf(api, form.operationId);
  if (!e || !api) return null;
  const filled = new Set(groups.filter((g) => formAround(groups, g)?.id === group.id).flatMap((g) => g.items.map((it) => it.field).filter((f): f is string => !!f)));
  const fields = Object.keys(requestOf(api, e)?.schema?.properties ?? {}).filter((f) => !filled.has(f) || form.values?.[f] !== undefined);
  if (!fields.length) return null;
  const put = (k: string, v: string) => {
    const next = { ...form.values };
    if (v) next[k] = v;
    else delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div data-form-values style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={label(p)}>{t("bdFormValues", lang)}</div>
      {fields.map((k) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 6, alignItems: "start" }}>
          <span title={k} style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: p.onSurfaceVariant, paddingTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {k}
          </span>
          <ExprField name={`value:${k}`} value={form.values?.[k] ?? ""} onCommit={(v) => put(k, v)} shape={shape} api={api} p={p} label={k} />
        </div>
      ))}
    </div>
  );
}

/* ---------- a screen ---------- */

function SourceCard({ frame, source, shape, p }: { frame: Frame; source: DataSource; shape: ScopeShape; p: Palette }) {
  const lang = useLang();
  const b = useContext(BindingsContext)!;
  const api = b.doc.api;
  const e = endpointOf(api, source.operationId);
  const set = (patch: Record<string, unknown>) => b.run(ops.updateDataSource, { screen: frame.id, name: source.name, ...patch }, `source:${frame.id}:${source.name}:${Object.keys(patch).join(",")}`);
  return (
    <div data-source={source.name} style={card(p)}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="cloud_download" size={16} color={p.primary} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>data.{source.name}</span>
        <IconBtn icon="delete" p={p} size={28} danger onClick={() => b.run(ops.removeDataSource, { screen: frame.id, name: source.name })} title={t("bdRemoveSource", lang)} />
      </div>
      <Field value={source.name} onChange={(v) => v && v !== source.name && set({ rename: v })} placeholder={t("bdSourceName", lang)} label={t("bdSourceName", lang)} p={p} height={32} />
      <Select height={30} label={t("bdEndpoint", lang)} p={p} value={source.operationId} options={endpointOptions(api)} onChange={(k) => set({ operationId: k })} />
      <ArgFields api={api} operationId={source.operationId} value={source.params} onChange={(params) => set({ params: params ?? null })} shape={shape} p={p} />
      <Segmented<string> options={[{ key: "enter", label: t("bdOnEnter", lang) }, { key: "demand", label: t("bdOnDemand", lang) }]} value={source.load ?? "enter"} onChange={(k) => set({ load: k === "enter" ? null : k })} p={p} height={30} label={t("bdLoads", lang)} />
      <Toggle on={!!source.pullToRefresh} onChange={(on) => set({ pullToRefresh: on || null })} p={p} label={t("bdPull", lang)} grow />
      {e?.pagination && (
        <>
          <Select
            height={30}
            label={t("bdPaging", lang)}
            p={p}
            value={source.paging ?? "none"}
            options={[
              { key: "none", label: t("bdPagingNone", lang) },
              { key: "scroll", label: t("bdPagingScroll", lang) },
              { key: "button", label: t("bdPagingButton", lang) },
            ]}
            onChange={(k) => set({ paging: k === "none" ? null : k })}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...label(p), flex: 1 }}>{t("bdPageSize", lang)}</span>
            <Num value={source.pageSize ?? 20} min={1} max={500} title={t("bdPageSize", lang)} lazy onChange={(pageSize) => set({ pageSize })} p={p} />
          </div>
        </>
      )}
    </div>
  );
}

/** On a screen: the data it loads, the one step that wires it to an endpoint, its params, and whether it needs a session. */
export function ScreenDataSection({ frame, p }: { frame: Frame; p: Palette }) {
  const lang = useLang();
  const b = useContext(BindingsContext);
  const shape = useShape(frame);
  const [wire, setWire] = useState("");
  const [detail, setDetail] = useState("");
  if (!b) return null;
  const api = b.doc.api;
  const endpoints = endpointOptions(api);
  const screens = b.doc.frames.filter((f) => f.id !== frame.id);
  return (
    <Section id="frame-data" icon="database" title={t("bdData", lang)} p={p}>
      <div data-screen-data style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {!endpoints.length && <div style={hint(p)}>{t("bdNoApi", lang)}</div>}
        {endpoints.length > 0 && (
          <div data-wire style={card(p)}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{t("bdWire", lang)}</div>
            <div style={hint(p)}>{t("bdWireHint", lang)}</div>
            <Select height={30} label={t("bdEndpoint", lang)} p={p} value={wire || endpoints[0].key} options={endpoints} onChange={setWire} />
            <Select height={30} label={t("bdWireDetail", lang)} p={p} value={detail} options={[{ key: "", label: t("bdNoScreen", lang) }, ...screens.map((f) => ({ key: f.id, label: f.name || f.id, icon: "smartphone" }))]} onChange={setDetail} />
            <button data-wire-go onClick={() => b.run(ops.wireScreen, { screen: frame.id, operationId: wire || endpoints[0].key, ...(detail ? { detail } : {}) })} className="m3-press" style={actionBtn(p)}>
              <Icon name="cable" size={16} />
              {t("bdWire", lang)}
            </button>
          </div>
        )}
        {(frame.data ?? []).map((d) => (
          <SourceCard key={d.name} frame={frame} source={d} shape={shape} p={p} />
        ))}
        {endpoints.length > 0 && (
          <Select height={30} label={t("bdAddSource", lang)} p={p} value="" options={[{ key: "", label: t("bdAddSource", lang), icon: "add" }, ...endpoints]} onChange={(k) => k && b.run(ops.addDataSource, { screen: frame.id, operationId: k })} />
        )}
        <div style={label(p)}>{t("bdParams", lang)}</div>
        {(frame.params ?? []).map((prm, i) => (
          <div key={i} data-screen-param={prm.name} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) 76px 28px", gap: 4, alignItems: "center" }}>
            <Field value={prm.name} onChange={(name) => name && b.run(ops.setScreenParams, { screen: frame.id, params: (frame.params ?? []).map((x, j) => (j === i ? { ...x, name } : x)) })} label={t("bdParamName", lang)} placeholder={t("bdParamName", lang)} p={p} height={30} />
            <Field value={prm.example ?? ""} onChange={(example) => b.run(ops.setScreenParams, { screen: frame.id, params: (frame.params ?? []).map((x, j) => (j === i ? { ...x, example } : x)) }, `params:${frame.id}:${i}`)} label={t("bdExample", lang)} placeholder={t("bdExample", lang)} p={p} height={30} />
            {/* what the screen is given: words, a number, yes or no */}
            <Select height={30} label={t("bdParamType", lang)} p={p} value={prm.type ?? "string"} options={(["string", "number", "boolean"] as const).map((k) => ({ key: k, label: t(`bdParamType_${k}`, lang) }))} onChange={(k) => b.run(ops.setScreenParams, { screen: frame.id, params: (frame.params ?? []).map((x, j) => (j === i ? { ...x, type: k as "string" | "number" | "boolean" } : x)) })} />
            <IconBtn icon="close" p={p} size={28} onClick={() => b.run(ops.setScreenParams, { screen: frame.id, params: (frame.params ?? []).filter((_, j) => j !== i) })} title={t("delete", lang)} />
          </div>
        ))}
        <button
          data-add-param
          onClick={() => {
            const taken = new Set((frame.params ?? []).map((x) => x.name));
            let n = 1;
            while (taken.has(`param${n}`)) n++;
            b.run(ops.setScreenParams, { screen: frame.id, params: [...(frame.params ?? []), { name: `param${n}` }] });
          }}
          className="m3-press"
          style={actionBtn(p)}
        >
          <Icon name="add" size={16} />
          {t("bdAddParam", lang)}
        </button>
        <Select
          height={30}
          label={t("bdAuth", lang)}
          p={p}
          value={frame.auth ?? "anyone"}
          options={[
            { key: "anyone", label: t("bdAuthAnyone", lang), icon: "public" },
            { key: "required", label: t("bdAuthRequired", lang), icon: "lock" },
            { key: "login", label: t("bdAuthLogin", lang), icon: "login" },
          ]}
          onChange={(k) => b.run(ops.setScreenAuth, { screen: frame.id, auth: k === "anyone" ? null : (k as "required" | "login") })}
        />
      </div>
    </Section>
  );
}

/* ---------- a part ---------- */

export const STATE_TEXT: Record<RegionState, UIKey> = { ready: "bdStateReady", loading: "bdStateLoading", empty: "bdStateEmpty", error: "bdStateError", forbidden: "bdStateForbidden" };

/** the props a part can bind to an expression: those with a value of one line, or a list */
/** the props an expression can stand for: a table too, from a list of records (an API list, a collection) */
const bindable = (it: Item) => (partBySlug(it.component)?.props ?? []).filter((d) => d.kind === "text" || d.kind === "number" || d.kind === "bool" || d.kind === "enum" || d.kind === "image" || d.kind === "icon" || d.kind === "list" || d.kind === "table");

/** On a part: its props from expressions, and on a container a repeat from data, the states of a region, a form; on an
 *  input in a form, its field. */
export function PartDataSection({ item, frame, p }: { item: Item; frame: Frame | null; p: Palette }) {
  const lang = useLang();
  const b = useContext(BindingsContext);
  const behavior = useContext(BehaviorContext);
  const group = behavior.group;
  const shape = useShape(frame ?? undefined, group?.id);
  const [adding, setAdding] = useState("");
  const [formOp, setFormOp] = useState("");
  if (!b || !group) return null;
  const api = b.doc.api;
  const def = partBySlug(item.component);
  const isContainer = !!def?.holds && !!item.props?.layout && item.props.layout !== "free";
  /* every binding is an expression; a plain read of a variable is the variable's (the prop's row binds it), a field of
     the design follows its variable (its own button) */
  const exprs = Object.entries(item.bind ?? {}).flatMap(([prop, v]) => {
    const e = prop.startsWith("@") || boundVarOf(v, b.doc.vars) ? null : bindExpr(v);
    return e === null ? [] : [{ prop, expr: e }];
  });
  const hasApi = !!api?.endpoints?.length;
  const form = formAround(b.doc.groups, group);
  const isInput = INPUT_PROP[item.component ?? ""] !== undefined || item.component === "file-upload";
  /* a table or a list can read the document's data sets (`collections.<name>`) with no API at all */
  const readsSets = !!b.doc.collections?.length && !!def?.props.some((d) => d.kind === "table" || d.kind === "list");
  if (!hasApi && !exprs.length && !frame?.data?.length && !readsSets) return null;
  const props = bindable(item);
  const run = b.run;
  const repeatHost = behavior.repeatHost;
  /* a repeat over data: its limit and the copies the canvas draws are its own */
  const byData = repeatHost?.repeat?.data !== undefined ? repeatHost.repeat : undefined;
  const setByData = (patch: { limit?: number; sample?: number }) => byData && repeatHost && run(ops.setRepeat, { id: repeatHost.id, repeat: { data: byData.data, limit: byData.limit, sample: byData.sample, ...patch } });
  const lists = listPaths(api ?? {}, repeatHost ? shapeFor(b.doc, frame ?? undefined, repeatHost.id, b.widths) : shape);
  const writable = endpointOptions(api, (m) => m === "post" || m === "put" || m === "patch");
  const designs = group.states ? regionDesigns(b.doc.groups, group) : {};
  return (
    <DesignSection id="data" title={t("bdData", lang)} p={p}>
      <div data-part-data style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* props read from expressions */}
        {exprs.length > 0 && <div style={label(p)}>{t("bdBindings", lang)}</div>}
        {exprs.map(({ prop, expr }) => {
          const d = def?.props.find((x) => x.key === prop);
          return (
            <div key={prop} data-bound-prop={prop} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ ...label(p), flex: 1 }}>{d ? labelOf(d, lang) : prop}</span>
                <IconBtn icon="link_off" p={p} size={24} onClick={() => run(ops.bindExpression, { id: item.id, prop, expr: null })} title={t("bdUnbind", lang)} />
              </div>
              <ExprField name={`bind:${prop}`} value={expr} onCommit={(v) => run(ops.bindExpression, { id: item.id, prop, expr: v || null })} shape={shape} api={api} p={p} label={d ? labelOf(d, lang) : prop} />
            </div>
          );
        })}
        {props.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Select height={28} label={t("bdBindProp", lang)} p={p} value={adding} options={[{ key: "", label: t("bdBindProp", lang), icon: "add_link" }, ...props.filter((d) => !exprs.some((x) => x.prop === d.key)).map((d) => ({ key: d.key, label: labelOf(d, lang) }))]} onChange={setAdding} />
            {adding && (
              <ExprField
                name={`new:${adding}`}
                value=""
                onCommit={(v) => {
                  if (v) run(ops.bindExpression, { id: item.id, prop: adding, expr: v });
                  setAdding("");
                }}
                shape={shape}
                api={api}
                p={p}
              />
            )}
          </div>
        )}

        {/* a repeat over data: on the container, or the one this part is the first child of */}
        {repeatHost && (lists.length > 0 || repeatHost.repeat?.data !== undefined) && repeatHost.repeat?.collection === undefined && (
          <div data-repeat-data style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Select
              height={28}
              label={t("bdRepeat", lang)}
              p={p}
              value={repeatHost.repeat?.data ?? ""}
              options={[{ key: "", label: t("bdRepeatNone", lang), icon: "block" }, ...lists.map((l) => ({ key: l.path, label: l.path, icon: "repeat" })), ...(repeatHost.repeat?.data && !lists.some((l) => l.path === repeatHost.repeat?.data) ? [{ key: repeatHost.repeat.data, label: repeatHost.repeat.data, icon: "repeat" }] : [])]}
              onChange={(k) => run(ops.setRepeat, { id: repeatHost.id, repeat: k ? { data: k } : null })}
            />
            {repeatHost.repeat?.data !== undefined && (
              <>
                {/* how many it draws at most, and how many copies the canvas shows while it has no data */}
                <div data-repeat-limits style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <Num value={byData?.limit ?? 200} min={1} max={200} title={t("bdRepeatLimit", lang)} lazy onChange={(limit) => setByData({ limit: limit < 200 ? limit : undefined })} p={p} />
                  <Num value={byData?.sample ?? SAMPLE_ROWS} min={1} max={12} title={t("bdRepeatSample", lang)} lazy onChange={(sample) => setByData({ sample })} p={p} />
                </div>
                <div style={hint(p)}>{t("bdRepeatHint", lang)}</div>
              </>
            )}
          </div>
        )}

        {/* the states of a region */}
        {isContainer && (frame?.data?.length ?? 0) > 0 && (
          <div data-region style={card(p)}>
            <Toggle on={!!group.states} onChange={(on) => (on ? run(ops.setRegion, { id: group.id, source: frame!.data![0].name }) : run(ops.removeRegion, { id: group.id }))} p={p} label={t("bdRegionMake", lang)} grow />
            {group.states && (
              <>
                <Select height={28} label={t("bdRegionSource", lang)} p={p} value={group.states.source ?? ""} options={(frame?.data ?? []).map((d) => ({ key: d.name, label: `data.${d.name}`, icon: "cloud_download" }))} onChange={(k) => run(ops.setRegion, { id: group.id, source: k, designs: false })} />
                <StateChips group={group} designs={designs} p={p} />
                {/* when the data counts as empty, over the default (no items, or nothing) */}
                <div style={label(p)}>{t("bdRegionEmptyWhen", lang)}</div>
                <ExprField name="emptyWhen" value={group.states.emptyWhen ?? ""} onCommit={(v) => run(ops.setRegion, { id: group.id, emptyWhen: v || null, designs: false })} shape={shape} api={api} p={p} label={t("bdRegionEmptyWhen", lang)} />
                {REGION_STATES.some((st) => st !== "ready" && !designs[st]?.length) && (
                  <button data-add-designs onClick={() => run(ops.setRegion, { id: group.id })} className="m3-press" style={actionBtn(p)}>
                    <Icon name="auto_awesome" size={16} />
                    {t("bdAddDesigns", lang)}
                  </button>
                )}
                <div style={hint(p)}>{t("bdRegionHint", lang)}</div>
              </>
            )}
          </div>
        )}

        {/* a form for an endpoint */}
        {isContainer && writable.length > 0 && (
          <div data-form-section style={card(p)}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{t("bdForm", lang)}</div>
            {group.form ? (
              <>
                <Select height={28} label={t("bdFormFor", lang)} p={p} value={group.form.operationId} options={writable} onChange={(k) => run(ops.setForm, { id: group.id, form: { ...group.form!, operationId: k } })} />
                <ArgFields api={api} operationId={group.form.operationId} value={group.form.params} onChange={(params) => run(ops.setForm, { id: group.id, form: { ...group.form!, ...(params ? { params } : { params: undefined }) } })} shape={shape} p={p} />
                <FormValues api={api} form={group.form} group={group} groups={b.doc.groups} shape={shape} p={p} onChange={(values) => run(ops.setForm, { id: group.id, form: { ...group.form!, values } })} />
                {/* what runs once it is answered: where it goes, what it sets, what it says */}
                <div style={label(p)}>{t("bdFormAnswer", lang)}</div>
                {/* eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it */}
                <BodyEditor title={t("bdThen", lang)} body={group.form.then} onChange={(then) => run(ops.setForm, { id: group.id, form: { ...group.form!, then } })} p={p} depth={1} response={(() => { const e = api ? endpointOf(api, group.form!.operationId) : undefined; return api && e ? (responseSchema(api, e) ?? true) : true; })()} />
                <BodyEditor title={t("bdCatch", lang)} body={group.form.catch} onChange={(next) => run(ops.setForm, { id: group.id, form: { ...group.form!, catch: next } })} p={p} depth={1} error />
                <button onClick={() => run(ops.setForm, { id: group.id, form: null })} className="m3-press" style={actionBtn(p)}>
                  <Icon name="remove_circle_outline" size={16} />
                  {t("bdFormRemove", lang)}
                </button>
              </>
            ) : (
              <>
                <div style={hint(p)}>{t("bdFormHint", lang)}</div>
                <Select height={28} label={t("bdFormFor", lang)} p={p} value={formOp || writable[0].key} options={writable} onChange={setFormOp} />
                <button data-make-form onClick={() => run(ops.makeForm, { id: group.id, operationId: formOp || writable[0].key })} className="m3-press" style={actionBtn(p)}>
                  <Icon name="dynamic_form" size={16} />
                  {t("bdFormMake", lang)}
                </button>
              </>
            )}
          </div>
        )}

        {/* an input in a form: the field it fills */}
        {isInput && form?.form && (
          <FieldPick item={item} form={form} p={p} />
        )}
      </div>
    </DesignSection>
  );
}

function FieldPick({ item, form, p }: { item: Item; form: Group; p: Palette }) {
  const lang = useLang();
  const b = useContext(BindingsContext)!;
  const api = b.doc.api;
  const e = endpointOf(api, form.form!.operationId);
  const req = api && e ? requestOf(api, e) : undefined;
  const names = Object.keys(req?.schema?.properties ?? {});
  return (
    <Select
      height={28}
      label={t("bdField", lang)}
      p={p}
      value={item.field ?? ""}
      options={[{ key: "", label: t("bdFieldNone", lang), icon: "link_off" }, ...names.map((n) => ({ key: n, label: n, icon: "input" }))]}
      onChange={(k) => b.run(ops.bindField, { id: item.id, field: k || null })}
    />
  );
}

/** the states of a region, each a chip: the one the canvas shows is chosen; one with no design says so */
export function StateChips({ group, designs, p, compact }: { group: Group; designs: Partial<Record<RegionState, Group[]>>; p: Palette; compact?: boolean }) {
  const lang = useLang();
  const b = useContext(BindingsContext);
  const show = group.states?.show ?? "ready";
  return (
    <div role="radiogroup" aria-label={t("bdState", lang)} data-state-chips={group.id} style={{ display: "flex", flexWrap: compact ? "nowrap" : "wrap", gap: 4, width: compact ? "max-content" : undefined }}>
      {REGION_STATES.map((st) => {
        const on = st === show;
        const missing = st !== "ready" && !designs[st]?.length;
        return (
          <button
            key={st}
            role="radio"
            aria-checked={on}
            data-state={st}
            title={missing ? `${t(STATE_TEXT[st], lang)} ${t("bdStateMissing", lang)}` : t(STATE_TEXT[st], lang)}
            onClick={() => b?.run(ops.setRegion, missing ? { id: group.id, show: st } : { id: group.id, show: st, designs: false }, undefined)}
            className="m3-press"
            style={{
              height: compact ? 24 : 28,
              padding: compact ? "0 8px" : "0 10px",
              borderRadius: 14,
              border: `1px solid ${on ? "transparent" : p.outlineVariant}`,
              background: on ? p.secondaryContainer : compact ? p.surface : "transparent",
              color: on ? p.onSecondaryContainer : missing ? p.outline : p.onSurfaceVariant,
              fontSize: compact ? 11 : 12,
              fontWeight: 600,
              cursor: "pointer",
              fontStyle: missing ? "italic" : undefined,
              whiteSpace: "nowrap",
            }}
          >
            {t(STATE_TEXT[st], lang)}
          </button>
        );
      })}
    </div>
  );
}

/** The state switcher on the canvas, over a region that is selected or holds the selection: Figma's variant switch for
 *  the states of data. */
export function CanvasStateSwitcher({ group, x, y, p, inside }: { group: Group; x: number; y: number; p: Palette; /** drawn over the region's top, where above it would cover its screen's name */ inside?: boolean }) {
  const b = useContext(BindingsContext);
  if (!b) return null;
  const designs = regionDesigns(b.doc.groups, group);
  return (
    <div data-state-switcher={group.id} onPointerDown={(e) => e.stopPropagation()} style={{ position: "absolute", left: x, top: y, transform: inside ? "translate(6px, 6px)" : "translateY(-100%)", paddingBottom: inside ? 0 : 6, zIndex: 60, pointerEvents: "auto" }}>
      <div style={{ padding: 3, borderRadius: 16, background: p.surfaceContainerHigh, boxShadow: "0 2px 8px rgba(0,0,0,0.16)" }}>
        <StateChips group={group} designs={designs} p={p} compact />
      </div>
    </div>
  );
}
