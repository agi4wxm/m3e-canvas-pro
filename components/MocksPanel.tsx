import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FAILURE_KINDS, type FailureKind, type MockCapabilityRule } from "@/lib/capabilities/types";
import { FAILURE_WORDS } from "@/lib/i18n/capabilities";
import type { Collection, Palette } from "@/lib/tokens";
import type { ApiSpec, JsonSchema, JsonSchemaObject } from "@/lib/api";
import { ops } from "@/lib/core";
import { t, useLang, type UIKey } from "@/lib/i18n";
import { MockData, compileRoutes, inferredHints, fileFits, FORMATS, formatOf, kindOfType, kindsFor, modelShape, idFieldOf, MOCK_LOCALES, dataUrlSize, type FileKind, type MockFile, type MockHint, type MockKind, type MockLocale, type MockOpRule, type MockRealtimeScript, type MockScenario, type MockSpec } from "@/lib/mocks";
import { Icon } from "./Icon";
import type { ApiRun } from "./ApiPanel";
import { ConfirmDialog, DenseContext, Field, IconBtn, Segmented, Select, Toggle } from "./ui";

/* a file's preview reads Office files, archives and 3D models: loaded with the first file shown */
const FilePreviewDialog = lazy(() => import("./MockFilePreview"));
const FilePreview = lazy(() => import("./MockFilePreview").then((m) => ({ default: m.FilePreview })));
const FileFacts = lazy(() => import("./MockFilePreview").then((m) => ({ default: m.FileFacts })));

/* The Mocks tab: how the API (the API tab's contract) is answered while the product is designed, with no back end
 * (lib/mocks, docs/模拟库.md). Scenarios and the one the preview starts in; each model's records as a table, how its
 * fields are made, records pinned by editing them; the library of files (uploaded, painted by the image model, or
 * placeholders); the realtime scripts; seed, language, latency and sign-in. Every change is an operation of the core
 * (lib/core/ops/mocks.ts), one undo step each, so the panel writes exactly what the in-app agent and MCP write. */

type Props = { p: Palette; api: ApiSpec | undefined; mocks: MockSpec | undefined; collections: Collection[]; run: ApiRun; paint: ((prompt: string) => Promise<string>) | null; capabilities?: string[] };

/** the platform capabilities the document invokes (lib/capabilities): the ones whose answers the mocks can be told */
const CapabilitiesContext = createContext<string[]>([]);

/** How the mocks answer each capability the design invokes: done (the catalog's example) or failing one way, after a
 *  delay; in every scenario, or in one (docs/平台能力.md). Each change is set_mock_capability, one undo step. */
function CapabilityRules({ rules, scenario, run, p }: { rules: Record<string, MockCapabilityRule> | undefined; scenario?: string; run: ApiRun; p: Palette }) {
  const lang = useLang();
  const names = useContext(CapabilitiesContext);
  if (!names.length) return null;
  const options = [{ key: "", label: t("capAnswerOk", lang) }, ...FAILURE_KINDS.map((k) => ({ key: k, label: t(FAILURE_WORDS[k], lang) }))];
  return (
    <div data-mocks-capabilities={scenario ?? ""} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={label(p)} title={t("capMocksHint", lang)}>
        {t("capMocks", lang)}
      </div>
      {names.map((name) => {
        const r = rules?.[name];
        const set = (patch: Record<string, unknown>) => run(ops.setMockCapability, { capability: name, ...(scenario ? { scenario } : {}), ...patch });
        return (
          <div key={name} data-mocks-capability={name} style={{ ...row, gap: 6 }}>
            <span style={{ ...mono, color: p.onSurface, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
            <div style={{ width: 132 }}>
              <Select options={options} value={r?.fail ?? ""} onChange={(k) => set({ fail: (k || null) as FailureKind | null })} p={p} label={name} height={28} />
            </div>
            <Cell value={r?.delayMs !== undefined ? String(r.delayMs) : ""} onCommit={(v) => set({ delayMs: num(v) === undefined ? null : Math.max(0, Math.min(60000, Math.round(num(v)!))) })} label={t("capDelay", lang)} p={p} width={56} numeric data={`capability-delay-${name}`} />
          </div>
        );
      })}
    </div>
  );
}

type Tab = "scenarios" | "data" | "files" | "realtime" | "settings";
const TAB_KEY = "m3e:mocks:tab";

const hint = (p: Palette): React.CSSProperties => ({ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px", textWrap: "pretty" });
const label = (p: Palette): React.CSSProperties => ({ fontSize: 11, fontWeight: 600, color: p.onSurfaceVariant, padding: "2px 2px 0", letterSpacing: 0.2 });
const card = (p: Palette): React.CSSProperties => ({ display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 12, background: p.surfaceContainerLow });
const chip = (p: Palette, strong = false): React.CSSProperties => ({ height: 28, padding: "0 10px 0 6px", borderRadius: 14, border: strong ? "none" : `1px solid ${p.outlineVariant}`, background: strong ? p.primary : "transparent", color: strong ? p.onPrimary : p.onSurface, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, flex: "0 0 auto" });
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, minWidth: 0 };
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 };

/** a cell that writes when it is left (or on Enter), as the API tab's */
function Cell({ value, onCommit, label: l, p, width, grow, data, numeric }: { value: string; onCommit: (v: string) => void; label: string; p: Palette; width?: number; grow?: boolean; data?: string; numeric?: boolean }) {
  const [v, setV] = useState(value);
  const [focus, setFocus] = useState(false);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v !== value) onCommit(v);
  };
  return (
    <input
      data-mocks-cell={data}
      value={v}
      placeholder={l}
      aria-label={l}
      inputMode={numeric ? "numeric" : undefined}
      spellCheck={false}
      onChange={(e) => setV(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setV(value);
      }}
      style={{ flex: grow ? "1 1 0" : "0 0 auto", width: width ?? (grow ? undefined : "100%"), minWidth: 0, height: 28, padding: "0 8px", borderRadius: 6, border: "none", outline: focus ? `2px solid ${p.primary}` : "none", outlineOffset: -2, background: p.surfaceContainerHigh, color: p.onSurface, fontSize: 12, boxSizing: "border-box" }}
    />
  );
}

const num = (s: string): number | undefined => (s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));

/* ---------- scenarios ---------- */

type Answer = "ok" | "empty" | "network" | "status" | "retry";
const answerOf = (r: MockOpRule | undefined): Answer => (!r ? "ok" : r.network ? "network" : r.empty ? "empty" : r.sequence?.length ? "retry" : typeof r.status === "number" ? "status" : "ok");
const ruleOf = (a: Answer, was: MockOpRule | undefined): MockOpRule | null => {
  const keep = was?.latencyMs !== undefined ? { latencyMs: was.latencyMs } : {};
  if (a === "ok") return Object.keys(keep).length ? keep : null;
  if (a === "empty") return { ...keep, empty: true };
  if (a === "network") return { ...keep, network: true };
  if (a === "retry") return { ...keep, sequence: [{ network: true }, {}] };
  return { ...keep, status: was?.status && was.status >= 400 ? was.status : 500 };
};

function AnswerPick({ value, onChange, p, data }: { value: MockOpRule | undefined; onChange: (r: MockOpRule | null) => void; p: Palette; data: string }) {
  const lang = useLang();
  const a = answerOf(value);
  const options: { key: Answer; label: string }[] = [
    { key: "ok", label: t("mocksAnswerOk", lang) },
    { key: "empty", label: t("mocksAnswerEmpty", lang) },
    { key: "network", label: t("mocksAnswerNetwork", lang) },
    { key: "status", label: t("mocksAnswerStatus", lang) },
    { key: "retry", label: t("mocksAnswerRetry", lang) },
  ];
  return (
    <div data-mocks-answer={data} style={{ ...row, gap: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Select options={options} value={a} onChange={(k) => onChange(ruleOf(k as Answer, value))} p={p} label={t("mocksAnswer", lang)} height={28} />
      </div>
      {a === "status" && <Cell value={String(value?.status ?? 500)} onCommit={(v) => onChange({ ...value, status: Math.max(100, Math.min(599, num(v) ?? 500)) })} label={t("mocksStatus", lang)} p={p} width={56} numeric data={`${data}-status`} />}
    </div>
  );
}

function ScenarioEditor({ s, api, run, p }: { s: MockScenario; api: ApiSpec; run: ApiRun; p: Palette }) {
  const lang = useLang();
  const [confirm, setConfirm] = useState(false);
  const update = (patch: Record<string, unknown>) => run(ops.updateMockScenario, { id: s.id, ...patch });
  const endpoints = api.endpoints ?? [];
  const free = endpoints.filter((e) => !s.ops?.[e.operationId]);
  return (
    <div data-mocks-scenario-editor={s.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0 2px" }}>
      <Cell value={s.name} onCommit={(v) => v.trim() && update({ name: v.trim() })} label={t("mocksScenarioName", lang)} p={p} data="scenario-name" />
      <Cell value={s.description ?? ""} onCommit={(v) => update({ description: v })} label={t("mocksDescription", lang)} p={p} data="scenario-description" />
      <div style={label(p)}>{t("mocksEvery", lang)}</div>
      <AnswerPick value={s.all} onChange={(r) => update({ all: r })} p={p} data="all" />
      <div style={{ ...row, gap: 6 }}>
        <span style={{ ...label(p), flex: 1 }}>{t("mocksLatency", lang)}</span>
        <Cell value={s.latency ? String(s.latency.min) : ""} onCommit={(v) => update({ latency: num(v) === undefined ? null : { min: num(v)!, max: Math.max(num(v)!, s.latency?.max ?? num(v)!) } })} label={t("mocksLatencyMin", lang)} p={p} width={64} numeric data="scenario-latency-min" />
        <Cell value={s.latency ? String(s.latency.max) : ""} onCommit={(v) => update({ latency: num(v) === undefined ? null : { min: Math.min(num(v)!, s.latency?.min ?? 0), max: num(v)! } })} label={t("mocksLatencyMax", lang)} p={p} width={64} numeric data="scenario-latency-max" />
      </div>
      <div style={{ ...row, gap: 6 }}>
        <span style={{ ...label(p), flex: 1 }}>{t("mocksErrorRate", lang)}</span>
        <Cell value={s.errorRate !== undefined ? String(Math.round(s.errorRate * 100)) : ""} onCommit={(v) => update({ errorRate: num(v) === undefined ? null : Math.max(0, Math.min(1, num(v)! / 100)) })} label="%" p={p} width={64} numeric />
      </div>
      <div style={{ ...row, gap: 6 }}>
        <span style={{ ...label(p), flex: 1 }}>{t("mocksCountAll", lang)}</span>
        <Cell value={s.counts?.["*"] !== undefined ? String(s.counts["*"]) : ""} onCommit={(v) => update({ counts: num(v) === undefined ? null : { ...s.counts, "*": Math.max(0, Math.min(5000, Math.round(num(v)!))) } })} label={t("mocksDefault", lang)} p={p} width={64} numeric data="scenario-count" />
      </div>
      <Toggle on={s.signedIn === false} onChange={(v) => update({ signedIn: v ? false : null })} p={p} label={t("mocksSignedOut", lang)} grow />
      <CapabilityRules rules={s.capabilities} scenario={s.id} run={run} p={p} />
      <div style={label(p)}>{t("mocksOps", lang)}</div>
      {Object.entries(s.ops ?? {}).map(([id, r]) => (
        <div key={id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: 6, borderRadius: 8, background: p.surfaceContainer }}>
          <div style={{ ...row, justifyContent: "space-between" }}>
            <span style={{ ...mono, color: p.onSurface, overflow: "hidden", textOverflow: "ellipsis" }}>{id}</span>
            <IconBtn icon="close" p={p} size={24} title={t("mocksRemoveOp", lang)} onClick={() => update({ ops: { [id]: null } })} />
          </div>
          <AnswerPick value={r} onChange={(next) => update({ ops: { [id]: next ?? {} } })} p={p} data={`op-${id}`} />
        </div>
      ))}
      {free.length > 0 && (
        <Select options={[{ key: "", label: t("mocksAddOp", lang) }, ...free.map((e) => ({ key: e.operationId, label: `${e.method.toUpperCase()} ${e.path}` }))]} value="" onChange={(k) => k && update({ ops: { [k]: { status: 500 } } })} p={p} label={t("mocksAddOp", lang)} height={28} />
      )}
      <button data-mocks-delete-scenario onClick={() => setConfirm(true)} className="m3-press" style={{ ...chip(p), color: p.error, alignSelf: "flex-start" }}>
        <Icon name="delete" size={16} />
        {t("mocksDeleteScenario", lang)}
      </button>
      <ConfirmDialog open={confirm} title={t("mocksDeleteScenario", lang)} body={s.name} p={p} onCancel={() => setConfirm(false)} onConfirm={() => (setConfirm(false), run(ops.removeMockScenario, { id: s.id }))} />
    </div>
  );
}

function ScenariosTab({ api, mocks, run, p }: { api: ApiSpec; mocks: MockSpec; run: ApiRun; p: Palette }) {
  const lang = useLang();
  const [open, setOpen] = useState<string | null>(null);
  const scenarios = mocks.scenarios ?? [];
  const choose = (id: string | null) => run(ops.setMocks, { scenario: id });
  const entry = (id: string, name: string, words: string | undefined, s?: MockScenario) => {
    const on = (mocks.scenario ?? "") === id;
    return (
      <div key={id || "normal"} data-mocks-scenario={id} style={{ display: "flex", flexDirection: "column", borderRadius: 12, background: open === id && s ? p.surfaceContainerLow : on ? p.secondaryContainer : "transparent", padding: open === id && s ? 6 : 0 }}>
        <div style={{ ...row, gap: 6, minHeight: 40, padding: "0 4px" }}>
          <button role="radio" aria-checked={on} title={t("mocksPreviewStarts", lang)} onClick={() => choose(id || null)} className="m3-press" style={{ width: 28, height: 28, borderRadius: 14, border: "none", background: "transparent", color: on ? p.primary : p.onSurfaceVariant, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
            <Icon name={on ? "radio_button_checked" : "radio_button_unchecked"} size={20} />
          </button>
          <button onClick={() => (s ? setOpen(open === id ? null : id) : choose(null))} className="m3-press" style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", padding: "4px 0" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: on ? p.onSecondaryContainer : p.onSurface }}>{name}</span>
            {words && <span style={{ fontSize: 11, color: p.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{words}</span>}
          </button>
          {s && <Icon name={open === id ? "expand_less" : "expand_more"} size={18} color={p.onSurfaceVariant} />}
        </div>
        {open === id && s && <ScenarioEditor s={s} api={api} run={run} p={p} />}
      </div>
    );
  };
  return (
    <div role="radiogroup" aria-label={t("mocksPreviewStarts", lang)} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={hint(p)}>{t("mocksPreviewStarts", lang)}</div>
      {entry("", t("mocksNormal", lang), t("mocksNormalHint", lang))}
      {scenarios.map((s) => entry(s.id, s.name, s.description, s))}
      <button
        data-mocks-add-scenario
        onClick={() => {
          const out = run(ops.addMockScenario, { name: t("mocksScenarioNth", lang).replace("{n}", String(scenarios.length + 1)), all: { empty: true } });
          if (out.ok) setOpen((out.result as { id: string }).id);
        }}
        className="m3-press"
        style={{ ...chip(p), alignSelf: "flex-start", marginTop: 4 }}
      >
        <Icon name="add" size={16} />
        {t("mocksAddScenario", lang)}
      </button>
    </div>
  );
}

/* ---------- data ---------- */

const kindWord = (k: MockKind, lang: ReturnType<typeof useLang>) => t(`mocksKind_${k}` as UIKey, lang);

/** a value in a few words: an object by its values (19.9 CNY), a list by its first and how many */
function shortText(v: unknown, depth = 0): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "object") return String(v);
  if (depth > 1) return "…";
  if (Array.isArray(v)) return v.length ? `${shortText(v[0], depth + 1)}${v.length > 1 ? ` +${v.length - 1}` : ""}` : "[]";
  const values = Object.values(v).filter((x) => x !== null && typeof x !== "object" && !(typeof x === "string" && x.startsWith("data:")));
  return values.length ? values.slice(0, 3).map((x) => String(x)).join(" ") : "{…}";
}

/** the width of the records' column of pictures: one thumbnail and room for how many more there are */
const THUMB_COLUMN = 52;
const thumb = (p: Palette): React.CSSProperties => ({ width: 28, height: 28, borderRadius: 6, objectFit: "cover", display: "block", flex: "0 0 auto", background: p.surfaceContainerHighest });

/** a value of a record in a cell: pictures as pictures (a list of them as its first and how many more), files by their
 *  kind, the rest as text cut to the cell */
function ValueView({ v, p }: { v: unknown; p: Palette }) {
  if (typeof v === "string" && v.startsWith("data:image/")) return <img data-mocks-image src={v} alt="" style={thumb(p)} />;
  if (typeof v === "string" && v.startsWith("data:")) return <Icon name={fileIcon(/^data:([^;,]*)/.exec(v)?.[1] ?? "")} size={20} color={p.onSurfaceVariant} />;
  if (Array.isArray(v) && v.length && typeof v[0] === "string" && v[0].startsWith("data:image/"))
    return (
      <span style={{ position: "relative", display: "block", width: 28, height: 28, flex: "0 0 auto" }}>
        <img data-mocks-image src={v[0] as string} alt="" style={thumb(p)} />
        {v.length > 1 && <span style={{ position: "absolute", right: -6, bottom: -4, minWidth: 16, height: 16, padding: "0 3px", boxSizing: "border-box", borderRadius: 8, background: p.inverseSurface, color: p.inverseOnSurface, fontSize: 10, fontWeight: 600, lineHeight: "16px", textAlign: "center" }}>+{v.length - 1}</span>}
      </span>
    );
  return <span style={{ display: "block", flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortText(v)}</span>;
}

/** a cell of the records' table: what it shows, and a field to change it (the record is then pinned) */
function RecordCell({ v, onCommit, p, data }: { v: unknown; onCommit: (next: unknown) => void; p: Palette; data: string }) {
  const [editing, setEditing] = useState(false);
  const editable = v === undefined || v === null || ["string", "number", "boolean"].includes(typeof v) || (typeof v === "object" && JSON.stringify(v).length < 400);
  const file = typeof v === "string" && v.startsWith("data:");
  if (editing && editable && !file) {
    const text = typeof v === "string" ? v : v === undefined ? "" : JSON.stringify(v);
    return (
      <input
        autoFocus
        data-mocks-record-input={data}
        defaultValue={text}
        onBlur={(e) => {
          setEditing(false);
          if (e.target.value === text) return;
          const raw = e.target.value;
          let next: unknown = raw;
          if (typeof v === "number" && Number.isFinite(Number(raw))) next = Number(raw);
          else if (typeof v === "boolean") next = raw === "true";
          else if (typeof v === "object" && v !== null) {
            try {
              next = JSON.parse(raw);
            } catch {
              return;
            }
          }
          onCommit(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        style={{ width: "100%", height: 26, border: "none", outline: `2px solid ${p.primary}`, borderRadius: 4, background: p.surfaceContainerHighest, color: p.onSurface, fontSize: 12, padding: "0 4px", boxSizing: "border-box" }}
      />
    );
  }
  return (
    <button data-mocks-record-cell={data} onClick={() => editable && !file && setEditing(true)} style={{ width: "100%", height: 34, border: "none", background: "transparent", color: p.onSurface, fontSize: 12, textAlign: "left", padding: "0 6px", cursor: editable && !file ? "text" : "default", display: "flex", alignItems: "center", minWidth: 0, overflow: "hidden" }}>
      <ValueView v={v} p={p} />
    </button>
  );
}

function HintRow({ model, path, schema, own, inferred, files, run, p }: { model: string; path: string; schema: JsonSchema | undefined; own: MockHint | undefined; inferred: MockHint; files: MockFile[]; run: ApiRun; p: Palette }) {
  const lang = useLang();
  const kinds = kindsFor(schema);
  const value = own?.kind ?? "auto";
  const kind = value === "auto" ? inferred.kind : value;
  const set = (h: MockHint | null) => run(ops.setMockModel, { model, hints: { [path]: h } });
  const fileKind: FileKind | null = kind === "avatar" || kind === "image" ? "image" : kind === "audio" ? "audio" : kind === "video" ? "video" : kind === "file" ? "file" : null;
  const pool = fileKind ? files.filter((f) => fileFits(f, fileKind)) : [];
  /* the formats a field of the kind may be made in: its family's, every document's for a file */
  const formats = fileKind ? FORMATS.filter((f) => (fileKind === "file" ? !["image", "audio", "video"].includes(f.family) : f.family === fileKind)) : [];
  const type = own?.type ?? inferred.type;
  return (
    <div data-mocks-hint={path} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.3fr)", gap: 6, alignItems: "center" }}>
      <span style={{ ...mono, color: p.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={path}>
        {path}
      </span>
      <Select
        options={kinds.map((k) => ({ key: k, label: k === "auto" ? t("mocksAuto", lang).replace("{kind}", kindWord(inferred.kind, lang)) : kindWord(k, lang) }))}
        value={kinds.includes(value as MockKind) ? value : "auto"}
        onChange={(k) => set(k === "auto" ? (own ? { ...own, kind: "auto" } : null) : { ...own, kind: k as MockKind })}
        p={p}
        label={path}
        height={28}
      />
      {formats.length > 1 && (
        <>
          <span style={label(p)}>{t("mocksFormat", lang)}</span>
          <Select
            options={[{ key: "", label: t("mocksFormatAuto", lang) }, ...formats.map((f) => ({ key: f.type, label: `${f.ext.toUpperCase()} · ${f.type}` }))]}
            value={type ? (formatOf(type)?.type ?? "") : ""}
            onChange={(k) => set({ ...own, kind, type: k || undefined })}
            p={p}
            label={t("mocksFormat", lang)}
            height={28}
            menuWidth={320}
          />
        </>
      )}
      {pool.length > 0 && (
        <>
          <span style={label(p)}>{t("mocksFilesUse", lang)}</span>
          <Select options={[{ key: "", label: t("mocksAnyFile", lang) }, ...pool.map((f) => ({ key: f.id, label: f.name }))]} value={own?.files?.[0] ?? ""} onChange={(k) => set({ ...own, kind, files: k ? [k] : undefined })} p={p} label={t("mocksFilesUse", lang)} height={28} />
        </>
      )}
    </div>
  );
}

function DataTab({ api, mocks, collections, run, p, locale }: { api: ApiSpec; mocks: MockSpec; collections: Collection[]; run: ApiRun; p: Palette; locale: MockLocale }) {
  const lang = useLang();
  /* the models whose records the endpoints hand out first: those are the ones a designer looks at */
  const listed = useMemo(() => new Set(compileRoutes(api, mocks).map((r) => r.model).filter(Boolean)), [api, mocks]);
  const models = useMemo(() => (api.models ?? []).filter((m) => typeof m.schema === "object" && modelShape(api, m.name)?.properties).sort((a, b) => Number(listed.has(b.name)) - Number(listed.has(a.name))), [api, listed]);
  const [model, setModel] = useState(models[0]?.name ?? "");
  const [shown, setShown] = useState(12);
  const [fields, setFields] = useState(false);
  useEffect(() => {
    if (!models.some((m) => m.name === model) && models[0]) setModel(models[0].name);
  }, [models, model]);
  const data = useMemo(() => new MockData({ api, mocks, collections }, { locale }), [api, mocks, collections, locale]);
  const records = useMemo(() => (model ? data.records(model) : []), [data, model]);
  const pinnedCount = useMemo(() => (model ? data.pinned(model).length : 0), [data, model]);
  if (!models.length) return <div style={hint(p)}>{t("mocksNoModels", lang)}</div>;
  const config = mocks.models?.find((m) => m.name === model);
  const shape = modelShape(api, model) as JsonSchemaObject | undefined;
  const props = (shape?.properties ?? {}) as Record<string, JsonSchema>;
  const idField = idFieldOf(api, model);
  const inferred = inferredHints(api, model);
  /* a narrow panel shows what tells records apart first: the picture, the name, then the rest, the id last */
  const kindOf = (c: string) => config?.hints?.[c]?.kind ?? inferred[c]?.kind ?? inferred[`${c}[]`]?.kind ?? "auto";
  const rank = (c: string) => (["avatar", "image"].includes(kindOf(c)) ? 0 : ["personName", "productName", "title", "company", "username"].includes(kindOf(c)) ? 1 : c === idField ? 3 : 2);
  const columns = Object.keys(props).sort((a, b) => rank(a) - rank(b));
  const widthOf = (c: string) => (rank(c) === 0 ? THUMB_COLUMN : 120);
  const pinnedIds = new Set((config?.fixtures ?? []).map((r) => String(idField ? r[idField] : "")));
  const pin = (rec: Record<string, unknown>) => run(ops.pinMockRecords, { model, records: [rec] });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ ...row, gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Select options={models.map((m) => ({ key: m.name, label: m.name }))} value={model} onChange={(k) => (setModel(k), setShown(12))} p={p} label={t("mocksModel", lang)} height={28} />
        </div>
        <Cell value={String(config?.count ?? records.length)} onCommit={(v) => num(v) !== undefined && run(ops.setMockModel, { model, count: Math.max(0, Math.min(5000, Math.round(num(v)!))) })} label={t("mocksCount", lang)} p={p} width={56} numeric data="count" />
        <IconBtn icon="casino" p={p} size={28} title={t("mocksRegenerate", lang)} onClick={() => run(ops.setMockModel, { model, regenerate: true })} />
      </div>
      <button onClick={() => setFields((x) => !x)} aria-expanded={fields} className="m3-press" style={{ ...row, height: 28, border: "none", background: "transparent", color: p.onSurfaceVariant, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "0 2px" }}>
        <Icon name={fields ? "expand_more" : "chevron_right"} size={16} />
        {t("mocksFields", lang)}
      </button>
      {fields && (
        <div data-mocks-hints style={{ ...card(p), gap: 4 }}>
          {Object.entries(inferred).map(([path, h]) => {
            const top = props[path.split(/[.[]/)[0]];
            const schema = path.includes(".") || path.includes("[") ? undefined : top;
            return <HintRow key={path} model={model} path={path} schema={schema ?? { type: h.kind === "integer" || h.kind === "quantity" ? "integer" : "string" }} own={config?.hints?.[path]} inferred={h} files={mocks.files ?? []} run={run} p={p} />;
          })}
        </div>
      )}
      <div style={{ ...row, justifyContent: "space-between" }}>
        <span style={label(p)}>
          {t("mocksRecords", lang)} · {records.length}
        </span>
      </div>
      <div style={hint(p)}>{t("mocksPinnedHint", lang)}</div>
      <div data-mocks-records={model} className="no-scrollbar" style={{ overflowX: "auto", borderRadius: 10, background: p.surfaceContainerLow }}>
        {/* fixed columns: a picture keeps to its own, words are cut at the cell's edge */}
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: 30 + columns.reduce((w, c) => w + widthOf(c), 0), minWidth: "100%" }}>
          <colgroup>
            <col style={{ width: 30 }} />
            {columns.map((c) => (
              <col key={c} style={{ width: widthOf(c) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th style={{ width: 30 }} />
              {columns.map((c) => (
                <th key={c} style={{ ...mono, fontSize: 11, fontWeight: 600, color: p.onSurfaceVariant, textAlign: "left", padding: "6px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.slice(0, shown).map((rec, i) => {
              const id = idField ? String(rec[idField]) : "";
              const pinned = i < pinnedCount && (pinnedIds.has(id) || !idField);
              return (
                <tr key={`${id}-${i}`} data-mocks-record={i} data-pinned={pinned ? "" : undefined} style={{ borderTop: `1px solid ${p.outlineVariant}` }}>
                  <td style={{ padding: 0 }}>
                    <button
                      title={pinned ? t("mocksUnpin", lang) : t("mocksPin", lang)}
                      aria-label={pinned ? t("mocksUnpin", lang) : t("mocksPin", lang)}
                      data-mocks-pin={i}
                      onClick={() => (pinned && idField ? run(ops.unpinMockRecords, { model, ids: [id] }) : pin(rec))}
                      style={{ width: 30, height: 30, border: "none", background: "transparent", color: pinned ? p.primary : p.outline, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Icon name="push_pin" size={16} fill={pinned} />
                    </button>
                  </td>
                  {columns.map((c) => (
                    <td key={c} style={{ padding: 0, overflow: "hidden" }}>
                      <RecordCell v={rec[c]} p={p} data={`${i}:${c}`} onCommit={(next) => pin({ ...rec, [c]: next })} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {records.length > shown && (
        <button onClick={() => setShown((n) => n + 24)} className="m3-press" style={{ ...chip(p), alignSelf: "center" }}>
          <Icon name="expand_more" size={16} />
          {t("mocksMore", lang)}
        </button>
      )}
    </div>
  );
}

/* ---------- files ---------- */

const MAX_FILE = 12_000_000;
const fileIcon = (type: string) =>
  ({ image: "image", pdf: "picture_as_pdf", audio: "audio_file", video: "video_file", document: "description", spreadsheet: "table_chart", presentation: "slideshow", data: "data_object", text: "article", archive: "folder_zip", model: "view_in_ar", file: "draft" })[kindOfType(type)];
const sizeText = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : n > 1000 ? `${Math.round(n / 1000)} KB` : `${n} B`);

function FilesTab({ mocks, run, p, paint, toast }: { mocks: MockSpec; run: ApiRun; p: Palette; paint: Props["paint"]; toast: (s: string) => void }) {
  const lang = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState("xlsx");
  const [shown, setShown] = useState<MockFile | null>(null);
  const files = mocks.files ?? [];
  /* a file of any format: what makes it loads first (the editor's own bundle has only the basic placeholders) */
  const makeFormat = () =>
    void ops.loadMockMakers().then(() => {
      const out = run(ops.generateMockFiles, { types: [format] });
      if (!out.ok) toast(out.message);
    });
  const upload = (list: FileList | null) => {
    for (const f of Array.from(list ?? [])) {
      if (f.size > MAX_FILE) {
        toast(t("mocksTooLarge", lang).replace("{name}", f.name));
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") run(ops.addMockFile, { name: f.name, type: f.type || undefined, data: reader.result, ...(f.type.startsWith("image/") ? { tags: ["image"] } : {}) });
      };
      reader.readAsDataURL(f);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ ...row, gap: 6, flexWrap: "wrap" }}>
        <button data-mocks-upload onClick={() => input.current?.click()} className="m3-press" style={chip(p, true)}>
          <Icon name="upload" size={16} />
          {t("mocksUpload", lang)}
        </button>
        <button data-mocks-placeholders title={t("mocksPlaceholdersHint", lang)} onClick={() => run(ops.generateMockFiles, { kinds: ["image", "pdf", "audio", "video", "file"] })} className="m3-press" style={chip(p)}>
          <Icon name="auto_fix_high" size={16} />
          {t("mocksPlaceholders", lang)}
        </button>
        <input ref={input} data-mocks-file-input type="file" multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
      </div>
      <div style={{ ...row, gap: 6 }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <Select options={FORMATS.map((f) => ({ key: f.ext, label: `${f.ext.toUpperCase()} · ${f.type}` }))} value={format} onChange={setFormat} p={p} label={t("mocksMakeFormat", lang)} height={28} menuWidth={320} />
        </div>
        <button data-mocks-make-format title={t("mocksMakeFormatHint", lang)} onClick={makeFormat} className="m3-press" style={chip(p)}>
          <Icon name="add" size={16} />
          {t("mocksMakeFormat", lang)}
        </button>
      </div>
      <div style={{ ...card(p), gap: 6 }}>
        <span style={label(p)}>{t("mocksPaint", lang)}</span>
        <Field value={prompt} onChange={setPrompt} placeholder={t("mocksPaintPrompt", lang)} p={p} height={32} />
        <button
          data-mocks-paint
          disabled={!paint || !prompt.trim() || busy}
          onClick={async () => {
            if (!paint) return;
            setBusy(true);
            try {
              const data = await paint(prompt.trim());
              if (data.startsWith("data:")) run(ops.addMockFile, { name: `${prompt.trim().slice(0, 30) || "picture"}.png`, data, tags: ["image"] });
              setPrompt("");
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
          className="m3-press"
          style={{ ...chip(p, !!paint), alignSelf: "flex-start", opacity: !paint || !prompt.trim() ? 0.5 : 1 }}
        >
          <Icon name="auto_awesome" size={16} />
          {busy ? t("mocksPainting", lang) : t("mocksPaintGo", lang)}
        </button>
        {!paint && <div style={hint(p)}>{t("mocksNoImageKey", lang)}</div>}
      </div>
      {!files.length && <div style={hint(p)}>{t("mocksNoFiles", lang)}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))", gap: 8 }}>
        {files.map((f) => (
          <div key={f.id} data-mocks-file={f.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: 6, borderRadius: 12, background: p.surfaceContainerLow, minWidth: 0 }}>
            <button
              data-mocks-file-thumb={f.id}
              onClick={() => setShown(f)}
              title={t("mocksPreview", lang)}
              aria-label={`${t("mocksPreview", lang)}: ${f.name}`}
              style={{ height: 84, padding: 0, border: "none", borderRadius: 8, background: p.surfaceContainerHigh, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-in" }}
            >
              {f.type.startsWith("audio/") ? (
                <audio src={f.data} controls style={{ width: "100%" }} onClick={(e) => e.stopPropagation()} />
              ) : (
                <Suspense fallback={<Icon name={fileIcon(f.type)} size={36} color={p.onSurfaceVariant} />}>
                  <FilePreview file={f} p={p} small />
                </Suspense>
              )}
            </button>
            <Suspense fallback={null}>
              <FileFacts file={f} p={p} />
            </Suspense>
            <Cell value={f.name} onCommit={(v) => v.trim() && run(ops.updateMockFile, { id: f.id, name: v.trim() })} label={f.name} p={p} />
            <Cell value={(f.tags ?? []).join(", ")} onCommit={(v) => run(ops.updateMockFile, { id: f.id, tags: v.split(/[,，、]\s*/).map((x) => x.trim()).filter(Boolean) })} label={t("mocksFileTags", lang)} p={p} />
            <div style={{ ...row, justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: p.onSurfaceVariant }}>{sizeText(dataUrlSize(f.data))}</span>
              <IconBtn icon="delete" p={p} size={24} title={t("mocksDeleteFile", lang)} onClick={() => run(ops.removeMockFile, { id: f.id })} />
            </div>
          </div>
        ))}
      </div>
      {shown && (
        <Suspense fallback={null}>
          <FilePreviewDialog file={files.find((f) => f.id === shown.id) ?? shown} p={p} onClose={() => setShown(null)} />
        </Suspense>
      )}
    </div>
  );
}

/* ---------- realtime ---------- */

function ScriptEditor({ s, api, run, p }: { s: MockRealtimeScript; api: ApiSpec; run: ApiRun; p: Palette }) {
  const lang = useLang();
  const channel = api.channels?.find((c) => c.id === s.channel);
  const messages = channel?.messages.map((m) => m.name) ?? [];
  const write = (patch: Partial<MockRealtimeScript>) => run(ops.setMockRealtime, { id: s.id, channel: s.channel, trigger: s.trigger, steps: s.steps, repeat: s.repeat ?? null, ...patch });
  const on = s.trigger?.on ?? "connect";
  return (
    <div data-mocks-script={s.id} style={{ ...card(p), gap: 6 }}>
      <div style={{ ...row, gap: 6 }}>
        <span style={{ ...mono, flex: 1, color: p.onSurface }}>{s.id}</span>
        <IconBtn icon="delete" p={p} size={24} title={t("mocksDeleteScript", lang)} onClick={() => run(ops.removeMockRealtime, { id: s.id })} />
      </div>
      <span style={label(p)}>{t("mocksTrigger", lang)}</span>
      <Select
        options={[
          { key: "connect", label: t("mocksOnConnect", lang) },
          { key: "call", label: t("mocksOnCall", lang) },
          { key: "message", label: t("mocksOnMessage", lang) },
        ]}
        value={on}
        onChange={(k) => write({ trigger: k === "call" ? { on: "call", operationId: api.endpoints?.[0]?.operationId ?? "" } : k === "message" ? { on: "message", message: messages[0] ?? "" } : { on: "connect" } })}
        p={p}
        label={t("mocksTrigger", lang)}
        height={28}
      />
      {s.trigger?.on === "call" && <Select options={(api.endpoints ?? []).map((e) => ({ key: e.operationId, label: e.operationId }))} value={s.trigger.operationId} onChange={(k) => write({ trigger: { on: "call", operationId: k } })} p={p} label={t("mocksOnCall", lang)} height={28} />}
      {s.trigger?.on === "message" && <Select options={messages.map((m) => ({ key: m, label: m }))} value={s.trigger.message} onChange={(k) => write({ trigger: { on: "message", message: k } })} p={p} label={t("mocksOnMessage", lang)} height={28} />}
      {s.steps.map((step, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "60px minmax(0, 1fr) 24px", gap: 4, alignItems: "center" }}>
          <Cell value={String(step.at)} onCommit={(v) => write({ steps: s.steps.map((x, j) => (j === i ? { ...x, at: Math.max(0, num(v) ?? 0) } : x)) })} label={t("mocksAt", lang)} p={p} numeric />
          <Select options={messages.map((m) => ({ key: m, label: m }))} value={step.message} onChange={(k) => write({ steps: s.steps.map((x, j) => (j === i ? { ...x, message: k } : x)) })} p={p} label={t("mocksMessage", lang)} height={28} />
          <IconBtn icon="close" p={p} size={24} title={t("delete", lang)} onClick={() => write({ steps: s.steps.filter((_, j) => j !== i) })} />
          <span />
          <Cell
            value={step.payload === undefined ? "" : JSON.stringify(step.payload)}
            onCommit={(v) => {
              let payload: unknown;
              try {
                payload = v.trim() ? JSON.parse(v) : undefined;
              } catch {
                return;
              }
              write({ steps: s.steps.map((x, j) => (j === i ? { at: x.at, message: x.message, ...(payload !== undefined ? { payload } : {}) } : x)) });
            }}
            label={t("mocksPayload", lang)}
            p={p}
          />
        </div>
      ))}
      <button onClick={() => write({ steps: [...s.steps, { at: (s.steps.at(-1)?.at ?? 0) + 1000, message: messages[0] ?? "" }] })} className="m3-press" style={{ ...chip(p), alignSelf: "flex-start" }}>
        <Icon name="add" size={16} />
        {t("mocksAddStep", lang)}
      </button>
      <div style={{ ...row, gap: 6 }}>
        <span style={{ ...label(p), flex: 1 }}>{t("mocksRepeatEvery", lang)}</span>
        <Cell value={s.repeat ? String(s.repeat.every) : ""} onCommit={(v) => write({ repeat: num(v) === undefined ? null : { every: Math.max(100, num(v)!), ...(s.repeat?.times !== undefined ? { times: s.repeat.times } : {}) } } as never)} label="ms" p={p} width={70} numeric />
        <Cell value={s.repeat?.times !== undefined ? String(s.repeat.times) : ""} onCommit={(v) => s.repeat && write({ repeat: { every: s.repeat.every, ...(num(v) !== undefined ? { times: Math.max(0, Math.round(num(v)!)) } : {}) } })} label={t("mocksRepeatTimes", lang)} p={p} width={56} numeric />
      </div>
    </div>
  );
}

function RealtimeTab({ api, mocks, run, p }: { api: ApiSpec; mocks: MockSpec; run: ApiRun; p: Palette }) {
  const lang = useLang();
  const channels = api.channels ?? [];
  if (!channels.length) return <div style={hint(p)}>{t("mocksNoChannels", lang)}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {!mocks.realtime && <div style={hint(p)}>{t("mocksDefaults", lang)}</div>}
      {channels.map((c) => {
        const sends = c.operations.filter((o) => o.action === "send").flatMap((o) => o.messages ?? c.messages.map((m) => m.name));
        return (
          <div key={c.id} data-mocks-channel={c.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ ...row, gap: 6 }}>
              <Icon name="sync_alt" size={16} color={p.onSurfaceVariant} />
              <span style={{ ...mono, fontWeight: 700, color: p.onSurface }}>{c.id}</span>
              <span style={{ ...mono, color: p.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis" }}>{c.address}</span>
            </div>
            {(mocks.realtime ?? []).filter((s) => s.channel === c.id).map((s) => (
              <ScriptEditor key={s.id} s={s} api={api} run={run} p={p} />
            ))}
            <button onClick={() => run(ops.setMockRealtime, { channel: c.id, steps: [{ at: 1000, message: sends[0] ?? c.messages[0]?.name ?? "" }] })} disabled={!c.messages.length} className="m3-press" style={{ ...chip(p), alignSelf: "flex-start" }}>
              <Icon name="add" size={16} />
              {t("mocksAddScript", lang)}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- settings ---------- */

const LOCALE_NAMES: Record<MockLocale, string> = { zh: "中文", en: "English", ja: "日本語", ko: "한국어" };

function SettingsTab({ api, mocks, run, p }: { api: ApiSpec; mocks: MockSpec; run: ApiRun; p: Palette }) {
  const lang = useLang();
  const [confirm, setConfirm] = useState(false);
  const accept = (mocks.auth?.accept ?? []).map((c) => Object.entries(c).map(([k, v]) => `${k}=${v}`).join(", ")).join("\n");
  const [acceptText, setAcceptText] = useState(accept);
  useEffect(() => setAcceptText(accept), [accept]);
  const secured = !!api.auth;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ ...row, gap: 6 }}>
        <span style={{ ...label(p), flex: 1 }} title={t("mocksSeedHint", lang)}>
          {t("mocksSeed", lang)}
        </span>
        <Cell value={String(mocks.seed ?? 1)} onCommit={(v) => num(v) !== undefined && run(ops.setMocks, { seed: Math.round(num(v)!) })} label={t("mocksSeed", lang)} p={p} width={80} numeric data="seed" />
        <IconBtn icon="casino" p={p} size={28} title={t("mocksShuffle", lang)} onClick={() => run(ops.setMocks, { seed: Math.floor(Math.random() * 100_000) + 2 })} />
      </div>
      <div style={hint(p)}>{t("mocksSeedHint", lang)}</div>
      <span style={label(p)}>{t("mocksLocale", lang)}</span>
      <Select options={[{ key: "", label: t("mocksLocaleEditor", lang) }, ...MOCK_LOCALES.map((l) => ({ key: l, label: LOCALE_NAMES[l] }))]} value={mocks.locale ?? ""} onChange={(k) => run(ops.setMocks, { locale: (k || null) as MockLocale | null })} p={p} label={t("mocksLocale", lang)} height={28} />
      <div style={{ ...row, gap: 6 }}>
        <span style={{ ...label(p), flex: 1 }}>{t("mocksLatency", lang)}</span>
        <Cell value={String(mocks.latency?.min ?? 150)} onCommit={(v) => num(v) !== undefined && run(ops.setMocks, { latency: { min: num(v)!, max: Math.max(num(v)!, mocks.latency?.max ?? 450) } })} label={t("mocksLatencyMin", lang)} p={p} width={64} numeric />
        <Cell value={String(mocks.latency?.max ?? 450)} onCommit={(v) => num(v) !== undefined && run(ops.setMocks, { latency: { min: Math.min(num(v)!, mocks.latency?.min ?? 150), max: num(v)! } })} label={t("mocksLatencyMax", lang)} p={p} width={64} numeric />
      </div>
      <div style={{ ...row, gap: 6 }}>
        <span style={{ ...label(p), flex: 1 }}>{t("mocksErrorRate", lang)}</span>
        <Cell value={String(Math.round((mocks.errorRate ?? 0) * 100))} onCommit={(v) => num(v) !== undefined && run(ops.setMocks, { errorRate: Math.max(0, Math.min(1, num(v)! / 100)) || null })} label="%" p={p} width={64} numeric />
      </div>
      <CapabilityRules rules={mocks.capabilities} run={run} p={p} />
      {secured && (
        <div style={{ ...card(p), gap: 6 }}>
          <span style={label(p)}>{t("mocksAuth", lang)}</span>
          <Toggle on={mocks.auth?.signedIn !== false} onChange={(v) => run(ops.setMockAuth, { signedIn: v ? null : false })} p={p} label={t("mocksStartSignedIn", lang)} grow />
          <span style={label(p)}>{t("mocksAccept", lang)}</span>
          <Field
            value={acceptText}
            onChange={setAcceptText}
            multiline
            rows={2}
            placeholder={t("mocksAcceptAny", lang)}
            label={t("mocksAccept", lang)}
            p={p}
          />
          <div style={hint(p)}>{t("mocksAcceptHint", lang)}</div>
          <button
            onClick={() => {
              const list = acceptText
                .split("\n")
                .map((line) => Object.fromEntries(line.split(/[,，]\s*/).map((pair) => pair.split("=").map((x) => x.trim())).filter((pair) => pair.length === 2 && pair[0])))
                .filter((c) => Object.keys(c).length);
              run(ops.setMockAuth, { accept: list.length ? list : null });
            }}
            disabled={acceptText === accept}
            className="m3-press"
            style={{ ...chip(p), alignSelf: "flex-start", opacity: acceptText === accept ? 0.5 : 1 }}
          >
            <Icon name="check" size={16} />
            {t("ok", lang)}
          </button>
          <div style={{ ...row, gap: 6 }}>
            <span style={{ ...label(p), flex: 1 }}>{t("mocksTokenTtl", lang)}</span>
            <Cell value={String(mocks.auth?.tokenTtl ?? 3600)} onCommit={(v) => num(v) !== undefined && run(ops.setMockAuth, { tokenTtl: Math.max(1, Math.round(num(v)!)) })} label="s" p={p} width={72} numeric />
          </div>
        </div>
      )}
      {mocks && Object.keys(mocks).length > 0 && (
        <button data-mocks-clear onClick={() => setConfirm(true)} className="m3-press" style={{ ...chip(p), color: p.error, alignSelf: "flex-start", marginTop: 8 }}>
          <Icon name="delete_sweep" size={16} />
          {t("mocksClear", lang)}
        </button>
      )}
      <ConfirmDialog open={confirm} title={t("mocksClear", lang)} body={t("mocksClearBody", lang)} p={p} onCancel={() => setConfirm(false)} onConfirm={() => (setConfirm(false), run(ops.clearMocks, {}))} />
    </div>
  );
}

/* ---------- the tab ---------- */

export function MocksPanel(props: Props) {
  return (
    <CapabilitiesContext.Provider value={props.capabilities ?? []}>
      <MocksPanelBody {...props} />
    </CapabilitiesContext.Provider>
  );
}

function MocksPanelBody({ p, api: given, mocks: givenMocks, collections, run, paint }: Props) {
  const lang = useLang();
  const api = given ?? {};
  const mocks = givenMocks ?? {};
  const locale: MockLocale = mocks.locale ?? ((MOCK_LOCALES as readonly string[]).includes(lang) ? (lang as MockLocale) : "en");
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const v = localStorage.getItem(TAB_KEY);
      return v === "data" || v === "files" || v === "realtime" || v === "settings" ? v : "scenarios";
    } catch {
      return "scenarios";
    }
  });
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 5000);
    return () => window.clearTimeout(id);
  }, [note]);
  const pick = (k: Tab) => {
    setTab(k);
    try {
      localStorage.setItem(TAB_KEY, k);
    } catch {
      /* the choice is only a convenience */
    }
  };
  const empty = !api.endpoints?.length && !api.models?.length && !api.channels?.length;
  const fill = () => {
    const out = run(ops.fillMocksOp, { locale });
    if (out.ok) {
      const r = out.result as { models: number; scenarios: string[] };
      setNote(t("mocksFilled", lang).replace("{models}", String(r.models)).replace("{scenarios}", String(r.scenarios.length)));
    }
  };
  return (
    <DenseContext.Provider value>
      <div data-mocks-panel className="no-scrollbar" style={{ height: "100%", overflowY: "auto", padding: "10px 12px 16px", display: "flex", flexDirection: "column", gap: 8, boxSizing: "border-box" }}>
        {empty ? (
          <div style={hint(p)}>{t("mocksNoApi", lang)}</div>
        ) : (
          <>
            <Segmented
              options={[
                { key: "scenarios", icon: "theater_comedy", title: t("mocksScenarios", lang), label: mocks.scenarios?.length ? String(mocks.scenarios.length) : undefined },
                { key: "data", icon: "table_rows", title: t("mocksData", lang) },
                { key: "files", icon: "perm_media", title: t("mocksFiles", lang), label: mocks.files?.length ? String(mocks.files.length) : undefined },
                { key: "realtime", icon: "sync_alt", title: t("mocksRealtime", lang) },
                { key: "settings", icon: "settings", title: t("mocksSettings", lang) },
              ]}
              value={tab}
              onChange={pick}
              p={p}
              height={32}
              label={t("mocksTab", lang)}
            />
            <div data-mocks-tab={tab} style={{ fontSize: 13, fontWeight: 700, color: p.onSurface }}>
              {t(tab === "scenarios" ? "mocksScenarios" : tab === "data" ? "mocksData" : tab === "files" ? "mocksFiles" : tab === "realtime" ? "mocksRealtime" : "mocksSettings", lang)}
            </div>
            {!givenMocks && (
              <div style={{ ...card(p), gap: 8 }}>
                <div style={hint(p)}>{t("mocksHint", lang)}</div>
                <button data-mocks-fill onClick={fill} className="m3-press" style={{ ...chip(p, true), alignSelf: "flex-start", height: 32 }}>
                  <Icon name="auto_awesome" size={16} />
                  {t("mocksFill", lang)}
                </button>
              </div>
            )}
            {note && (
              <div role="status" style={{ ...hint(p), color: p.primary }}>
                {note}
              </div>
            )}
            {tab === "scenarios" ? (
              <ScenariosTab api={api} mocks={mocks} run={run} p={p} />
            ) : tab === "data" ? (
              <DataTab api={api} mocks={mocks} collections={collections} run={run} p={p} locale={locale} />
            ) : tab === "files" ? (
              <FilesTab mocks={mocks} run={run} p={p} paint={paint} toast={setNote} />
            ) : tab === "realtime" ? (
              <RealtimeTab api={api} mocks={mocks} run={run} p={p} />
            ) : (
              <SettingsTab api={api} mocks={mocks} run={run} p={p} />
            )}
          </>
        )}
      </div>
    </DenseContext.Provider>
  );
}
